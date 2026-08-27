# =============================================================================
# Stage 1: Build Frontend (Vite + React)
# =============================================================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# =============================================================================
# Stage 2: Production Python Backend (FastAPI + Uvicorn)
# =============================================================================
FROM python:3.11-slim
WORKDIR /app

# Install system libraries for PostgreSQL/psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY scripts /app/scripts
COPY alembic.ini /app/alembic.ini
COPY --from=frontend-builder /app/dist /app/dist

ENV PORT=8000
EXPOSE 8000

# Use shell form to expand $PORT dynamically set by Railway/Render
CMD uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
