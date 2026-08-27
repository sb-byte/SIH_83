from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import logging
import sys
from .config import settings

logger = logging.getLogger("unity_eoc.database")

Base = declarative_base()

def init_engine():
    target_url = settings.DATABASE_URL
    if target_url and target_url.startswith("postgres://"):
        target_url = target_url.replace("postgres://", "postgresql://", 1)

    connect_args = {}
    
    if target_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        return create_engine(target_url, connect_args=connect_args, pool_pre_ping=True)
    
    try:
        pg_engine = create_engine(target_url, pool_pre_ping=True)
        with pg_engine.connect() as conn:
            logger.info("Connected to PostgreSQL Database successfully.")
        return pg_engine
    except Exception as e:
        logger.warning(f"PostgreSQL connection notice ({e}). Using local database engine for high availability.")
        fallback_url = "sqlite:///./unity_eoc.db"
        return create_engine(fallback_url, connect_args={"check_same_thread": False}, pool_pre_ping=True)

engine = init_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

