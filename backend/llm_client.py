"""
llm_client.py — Unified LLM Provider Abstraction for IPO Sherpa
==================================================================
Wraps Groq, OpenAI, Anthropic, and local Ollama behind one interface so the
active LLM provider is a config change (LLM_PROVIDER env var), not a code
change scattered across every module that calls an LLM.

Provider selection (.env):
    LLM_PROVIDER = groq | openai | anthropic | ollama   (default: groq)
    LLM_MODEL    = optional override; each provider has a sensible default

Per-provider credentials:
    groq      -> GROQ_API_KEY (+ optional GROQ_API_KEY_2 for failover — see below)
    openai    -> OPENAI_API_KEY
    anthropic -> ANTHROPIC_API_KEY
    ollama    -> OLLAMA_BASE_URL (default http://localhost:11434/v1); no key needed

Groq two-key failover:
    If GROQ_API_KEY_2 is also set, a request that hits GROQ_API_KEY's rate
    limit automatically retries once on GROQ_API_KEY_2, which then becomes
    the active ("primary") key for subsequent requests. If GROQ_API_KEY_2
    later rate-limits too, the retry falls back to GROQ_API_KEY again — the
    two keys just swap primary/secondary roles on failure. Useful for
    stretching a limited free-tier daily token quota across two accounts.

Usage:
    from llm_client import get_llm_client

    llm = get_llm_client()
    if not llm.is_available():
        ...offline/demo fallback...
    text = llm.complete(
        messages=[{"role": "user", "content": "..."}],
        temperature=0.2,
        max_tokens=800,
        json_mode=True,
    )
"""

import os
import logging
from typing import Dict, List, Optional

logger = logging.getLogger("sebi-ipo-generator.llm_client")

DEFAULT_MODELS = {
    "groq": "llama-3.3-70b-versatile",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-sonnet-4-5",
    "ollama": "llama3.1:8b-instruct",
}

# Substrings that flag an env var as still holding its placeholder value
# rather than a real credential (matches the convention already used
# throughout the codebase, e.g. "your_groq_api_key" in .env.example).
_PLACEHOLDER_MARKERS = ("your_groq_api_key", "your_openai_api_key", "your_anthropic_api_key", "changeme", "xxxxx")


def _is_placeholder(key: str) -> bool:
    if not key or not key.strip():
        return True
    low = key.lower()
    return any(marker in low for marker in _PLACEHOLDER_MARKERS)


class LLMClient:
    """Provider-agnostic chat-completion client.

    `messages` always uses the standard OpenAI-style
    [{"role": "system"|"user"|"assistant", "content": str}] shape regardless
    of provider; Anthropic's separate-system-parameter convention is handled
    internally so callers never need provider-specific branches.
    """

    def __init__(self, provider: Optional[str] = None, model: Optional[str] = None):
        self.provider = (provider or os.getenv("LLM_PROVIDER", "groq")).strip().lower()
        if self.provider not in DEFAULT_MODELS:
            logger.warning(f"Unknown LLM_PROVIDER '{self.provider}'; defaulting to 'groq'.")
            self.provider = "groq"
        self.model = (model or os.getenv("LLM_MODEL", "").strip()) or DEFAULT_MODELS[self.provider]
        self._client = None
        self._init_error: Optional[str] = None
        self._groq_keys: List[str] = []
        self._groq_key_index: int = 0
        self._init_client()

    # ── Provider client construction ──────────────────────────────────────

    def _init_client(self) -> None:
        try:
            if self.provider == "groq":
                from groq import Groq
                self._groq_keys = [
                    k for k in (os.getenv("GROQ_API_KEY", ""), os.getenv("GROQ_API_KEY_2", ""))
                    if not _is_placeholder(k)
                ]
                if not self._groq_keys:
                    self._init_error = "GROQ_API_KEY not configured"
                    return
                self._client = Groq(api_key=self._groq_keys[self._groq_key_index])

            elif self.provider == "openai":
                from openai import OpenAI
                key = os.getenv("OPENAI_API_KEY", "")
                if _is_placeholder(key):
                    self._init_error = "OPENAI_API_KEY not configured"
                    return
                self._client = OpenAI(api_key=key)

            elif self.provider == "anthropic":
                import anthropic
                key = os.getenv("ANTHROPIC_API_KEY", "")
                if _is_placeholder(key):
                    self._init_error = "ANTHROPIC_API_KEY not configured"
                    return
                self._client = anthropic.Anthropic(api_key=key)

            elif self.provider == "ollama":
                # Ollama exposes an OpenAI-compatible /v1 endpoint, so the
                # openai SDK is reused instead of adding a 5th dependency.
                # No API key is needed for a local instance.
                from openai import OpenAI
                base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1").strip()
                self._client = OpenAI(api_key="ollama", base_url=base_url)

        except ImportError as e:
            self._init_error = f"'{self.provider}' SDK not installed ({e})"
            logger.warning(f"LLM provider '{self.provider}' unavailable: {self._init_error}")
        except Exception as e:
            self._init_error = f"'{self.provider}' client init failed ({e})"
            logger.warning(f"LLM provider '{self.provider}' unavailable: {self._init_error}")

    def is_available(self) -> bool:
        return self._client is not None

    def unavailable_reason(self) -> str:
        return self._init_error or "LLM client not initialised"

    # ── Unified completion call ───────────────────────────────────────────

    def complete(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None,
        json_mode: bool = False,
    ) -> str:
        """Sends a chat completion request and returns the plain text response.

        Raises RuntimeError if the client wasn't initialised (check
        is_available() first) or the provider call itself fails — callers
        already wrap LLM calls in try/except with an offline fallback, so
        this intentionally does not swallow errors itself.
        """
        if not self.is_available():
            raise RuntimeError(f"LLM client unavailable: {self.unavailable_reason()}")

        if self.provider in ("groq", "openai", "ollama"):
            kwargs = {"messages": messages, "model": self.model, "temperature": temperature}
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            if json_mode and self.provider != "ollama":
                # Local Ollama builds/models don't reliably honour response_format yet;
                # JSON-mode callers already instruct the format in-prompt as a fallback.
                kwargs["response_format"] = {"type": "json_object"}
            if self.provider == "groq" and len(self._groq_keys) > 1:
                return self._complete_groq_with_failover(kwargs)
            completion = self._client.chat.completions.create(**kwargs)
            return (completion.choices[0].message.content or "").strip()

        elif self.provider == "anthropic":
            system_msg = "\n".join(m["content"] for m in messages if m.get("role") == "system")
            convo = [m for m in messages if m.get("role") != "system"]
            kwargs = {
                "model": self.model,
                "max_tokens": max_tokens or 1024,
                "temperature": temperature,
                "messages": convo,
            }
            if system_msg:
                kwargs["system"] = system_msg
            response = self._client.messages.create(**kwargs)
            return "".join(
                block.text for block in response.content if getattr(block, "type", "") == "text"
            ).strip()

        raise RuntimeError(f"Unsupported LLM provider: {self.provider}")

    def _complete_groq_with_failover(self, kwargs: Dict) -> str:
        """Two-key failover for Groq: on a rate-limit error, swap to the other
        configured key and retry once. The key that just worked stays active
        ("primary") for subsequent calls. If the second attempt also hits a
        rate limit, both keys are exhausted — swap back to the original key
        (so the next unrelated call starts there rather than the one that
        just failed twice) and let the error propagate to the caller's
        existing is_rate_limit_error handling.
        """
        from groq import Groq
        try:
            completion = self._client.chat.completions.create(**kwargs)
            return (completion.choices[0].message.content or "").strip()
        except Exception as e:
            if not is_rate_limit_error(e):
                raise
            fallback_index = (self._groq_key_index + 1) % len(self._groq_keys)
            logger.warning(f"Groq key #{self._groq_key_index + 1} rate-limited; switching to key #{fallback_index + 1}.")
            self._groq_key_index = fallback_index
            self._client = Groq(api_key=self._groq_keys[self._groq_key_index])
            try:
                completion = self._client.chat.completions.create(**kwargs)
                return (completion.choices[0].message.content or "").strip()
            except Exception as e2:
                if is_rate_limit_error(e2):
                    self._groq_key_index = (self._groq_key_index + 1) % len(self._groq_keys)
                    self._client = Groq(api_key=self._groq_keys[self._groq_key_index])
                raise e2


def is_rate_limit_error(exc: Exception) -> bool:
    """True if `exc` is a provider rate-limit error (HTTP 429) — groq, openai, and
    anthropic's SDKs each raise a same-named `RateLimitError` class, so matching on
    the class name avoids importing all three SDKs just to check `isinstance`.
    Callers use this to give a distinct "usage limit reached, try again shortly"
    message instead of silently folding it into the generic offline-fallback path,
    which reads as "the AI is broken" rather than "today's quota is used up."
    """
    return type(exc).__name__ == "RateLimitError"


_singleton: Optional["LLMClient"] = None


def get_llm_client() -> "LLMClient":
    """Returns the process-wide LLM client singleton, built from env config on first use."""
    global _singleton
    if _singleton is None:
        _singleton = LLMClient()
    return _singleton


def reset_llm_client() -> None:
    """Clears the cached singleton. Call after changing LLM_PROVIDER/keys at runtime (e.g. in tests)."""
    global _singleton
    _singleton = None
