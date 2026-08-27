from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import logging
import sys
from .config import settings

logger = logging.getLogger("unity_eoc.database")

Base = declarative_base()

def init_engine():
    target_url = settings.DATABASE_URL
    connect_args = {}
    
    if target_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        return create_engine(target_url, connect_args=connect_args, pool_pre_ping=True)
    
    try:
        # Try PostgreSQL connection strictly
        pg_engine = create_engine(target_url, pool_pre_ping=True)
        with pg_engine.connect() as conn:
            logger.info("Connected to PostgreSQL Database successfully.")
        return pg_engine
    except Exception as e:
        error_msg = f"CRITICAL: Failed to connect to PostgreSQL database at '{target_url}': {e}. System stopping to prevent data loss."
        logger.critical(error_msg)
        raise RuntimeError(error_msg) from e

engine = init_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

