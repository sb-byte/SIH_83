FROM python:3.11-slim
WORKDIR /app

# Install system dependencies for PostgreSQL/psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
COPY scripts /app/scripts
COPY alembic.ini /app/alembic.ini

ENV PORT=8000
EXPOSE 8000

# Start FastAPI using Uvicorn on dynamic $PORT
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
