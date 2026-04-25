#!/usr/bin/env bash
# Local dev launcher. Always runs uvicorn from the project's .venv (Python 3.11).
#
# Why this exists:
#   `uvicorn main:app --reload` resolves to whatever Python comes first on PATH.
#   On this machine, anaconda's `(base)` env shadows the project venv, so plain
#   `uvicorn` ends up running anaconda's Python 3.13. That interpreter segfaults
#   inside WeasyPrint/Pango when rendering the PDF report (numpy 2.1 +
#   matplotlib 3.10 + macOS native libs). Calling .venv/bin/uvicorn directly
#   bypasses PATH ordering entirely.
#
# Railway / Docker do not need this script — the Dockerfile pins python:3.11-slim.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -x ".venv/bin/uvicorn" ]]; then
  echo "error: .venv/bin/uvicorn not found." >&2
  echo "       Bootstrap the venv first:" >&2
  echo "         python3.11 -m venv .venv" >&2
  echo "         .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

PY_VER="$(.venv/bin/python -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if [[ "$PY_VER" != "3.11" ]]; then
  echo "warning: .venv is Python $PY_VER, expected 3.11" >&2
  echo "         WeasyPrint may segfault on macOS with other versions." >&2
fi

: "${SECRET_KEY:=$(.venv/bin/python -c 'import secrets; print(secrets.token_hex(32))')}"
: "${DATABASE_URL:=sqlite+aiosqlite:///./bias_audit.db}"
: "${ENVIRONMENT:=development}"
: "${CORS_ORIGINS:=http://localhost:3000}"
export SECRET_KEY DATABASE_URL ENVIRONMENT CORS_ORIGINS

echo "── starting uvicorn ──"
echo "  python:    $(.venv/bin/python --version)"
echo "  interp:    $(.venv/bin/python -c 'import sys; print(sys.executable)')"
echo "  cors:      $CORS_ORIGINS"
echo "──────────────────────"

exec .venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000
