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

# Install Python deps first so Docker can cache the layer between code edits.
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# Railway injects $PORT at runtime; default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000

# Run migrations then start the server. Same command as railway.toml so a
# raw `docker run` matches Railway's deploy behaviour.
CMD alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port ${PORT}
