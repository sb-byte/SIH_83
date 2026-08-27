import os
import psycopg2
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv()

db_url = os.getenv("DATABASE_URL", "")

if not db_url or "YOUR_POSTGRES_PASSWORD" in db_url:
    print("CRITICAL: Please set your actual PostgreSQL password in .env file before running this script.")
    exit(1)

try:
    parsed = urlparse(db_url)
    user = parsed.username or "postgres"
    password = parsed.password or ""
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    target_db = parsed.path.lstrip("/") or "unity_eoc"

    print(f"Connecting to PostgreSQL at {host}:{port} as user '{user}'...")

    # Connect to default 'postgres' system database
    conn = psycopg2.connect(dbname="postgres", user=user, password=password, host=host, port=port)
    conn.autocommit = True
    cursor = conn.cursor()

    # Check if target database exists
    cursor.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{target_db}'")
    exists = cursor.fetchone()

    if not exists:
        print(f"Creating database '{target_db}'...")
        cursor.execute(f'CREATE DATABASE "{target_db}"')
        print(f"SUCCESS: Database '{target_db}' created successfully!")
    else:
        print(f"Database '{target_db}' already exists.")

    cursor.close()
    conn.close()

    # Try connecting to target_db and creating PostGIS extension
    conn_target = psycopg2.connect(dbname=target_db, user=user, password=password, host=host, port=port)
    conn_target.autocommit = True
    cursor_target = conn_target.cursor()
    try:
        cursor_target.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        print("PostGIS extension enabled.")
    except Exception as e:
        print(f"Notice: PostGIS extension check: {e}")
    cursor_target.close()
    conn_target.close()

except Exception as e:
    print(f"Error creating database: {e}")
