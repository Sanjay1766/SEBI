# ── Stage 1: Build ──────────────────────────────────────────────────────────
# Python 3.11 (not 3.14) for maximum wheel compatibility with camelot/torch.
FROM python:3.11-slim AS builder

WORKDIR /app

# System deps for camelot (OpenCV headless) and pdf2image
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    ghostscript \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Install torch CPU-only FIRST — smaller wheel (~200 MB vs 700 MB GPU)
# Doing this in a separate layer so Docker caches it between rebuilds
RUN pip install --no-cache-dir \
    torch \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Pre-cache the sentence-transformers model at build time ─────────────────
# This avoids a 30-second HuggingFace download on the first API request.
# The model is saved to /root/.cache/huggingface inside the image.
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
SentenceTransformer('all-MiniLM-L6-v2'); \
print('[Dockerfile] Model cached successfully.')"


# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Runtime system libs only (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    ghostscript \
    poppler-utils \
    tesseract-ocr \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from builder
COPY --from=builder /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy pre-cached HuggingFace model
COPY --from=builder /root/.cache /root/.cache

# Copy application source
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Health-check so Railway/Render knows when the app is ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Start server (single worker; add --workers 2 if you have >= 2 GB RAM)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
