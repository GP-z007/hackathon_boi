FROM python:3.11-slim

# WeasyPrint native dependencies (cairo / pango / harfbuzz / fonts).
# build-essential + libpq-dev are needed so psycopg2-binary's wheel falls back
# to a source build cleanly on uncommon architectures.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        libcairo2 \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libgdk-pixbuf-2.0-0 \
        libharfbuzz0b \
        libffi8 \
        shared-mime-info \
        fonts-liberation \
        fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Layer 1: pip itself (cacheable)
RUN pip install --no-cache-dir --upgrade pip

# Layer 2: CPU-only PyTorch.
# Pre-installing torch from the CPU wheel index drops ~1.5 GB of CUDA libs
# from the image. sentence-transformers / sdv only need CPU inference here.
# We pin to a version that satisfies sdv 1.9.0 + sentence-transformers 3.0.1.
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.4.0

# Layer 3: the rest of the deps. pip sees torch is already satisfied and
# won't re-pull the CUDA wheel.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Layer 4: application code (changes most often; keep last for cache hits)
COPY . .

# Railway / Fly / Render inject $PORT at runtime; default to 8000 for local
# `docker run`.
ENV PORT=8000
EXPOSE 8000

# Run migrations then start the server. Same command as railway.toml's
# startCommand so a raw `docker run` matches managed-platform behaviour.
# Shell form is required so ${PORT} expands at container start.
CMD alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT}
