FROM python:3.12-slim

WORKDIR /app

ENV PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY alembic.ini .
COPY alembic/ alembic/
COPY app/ app/
COPY entrypoint.sh .

# Run as non-root user for security
RUN addgroup --system appuser && adduser --system --ingroup appuser appuser
RUN mkdir -p /tmp/gruppen-academy-uploads && chown appuser:appuser /tmp/gruppen-academy-uploads
USER appuser

EXPOSE 8000

CMD ["./entrypoint.sh"]
