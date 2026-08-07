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
    groq      -> GROQ_API_KEY
    openai    -> OPENAI_API_KEY
    anthropic -> ANTHROPIC_API_KEY
    ollama    -> OLLAMA_BASE_URL (default http://localhost:11434/v1); no key needed

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
        self._init_client()

    # ── Provider client construction ──────────────────────────────────────

    def _init_client(self) -> None:
        try:
            if self.provider == "groq":
                from groq import Groq
                key = os.getenv("GROQ_API_KEY", "")
                if _is_placeholder(key):
                    self._init_error = "GROQ_API_KEY not configured"
                    return
                self._client = Groq(api_key=key)

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
