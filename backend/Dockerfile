FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Headless Chromium for the admin Catalog Generator (HTML/CSS -> PDF).
# `playwright install --with-deps` failed on this image's Debian 13 (trixie) —
# its hardcoded apt package list (ttf-unifont, ttf-ubuntu-font-family) predates
# trixie's package renames. Debian's own `chromium` package resolves its own
# deps correctly for whatever Debian version is current, so use that instead
# and point Playwright at the system binary (see catalog_pdf.py).
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
