from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "Unity EOC — Disaster Operations Center API"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    
    # Secret Key for HS256 JWT
    SECRET_KEY: str = os.getenv("JWT_SECRET", "unity-eoc-india-sovereign-national-secret-key-2026-ndma-mha")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12 # 12 hours
    
    # Database URL: default SQLite with plain lat/lng, or PostgreSQL via env
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./unity_eoc.db")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "*"
    ]
    
    # Demo Mode allows fetching current rotating TOTP code for seeded credentials
    DEMO_MODE: bool = os.getenv("UNITY_DEMO_MODE", "1") in ("1", "true", "True")

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
