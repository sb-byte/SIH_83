from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os

class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", env_file=".env", case_sensitive=False)

    PROJECT_NAME: str = "Unity EOC — Disaster Operations Center API"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    
    # Secret Key for HS256 JWT
    SECRET_KEY: str = os.getenv("JWT_SECRET", "unity-eoc-india-sovereign-national-secret-key-2026-ndma-mha")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "unity-eoc-india-sovereign-national-secret-key-2026-ndma-mha")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12 # 12 hours
    
    # Database URL & Redis URL
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/unity_eoc")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "https://unity-eoc-web.onrender.com",
        "https://unity-eoc-api.onrender.com"
    ]
    
    # Demo Mode allows fetching current rotating TOTP code for seeded credentials
    DEMO_MODE: bool = os.getenv("UNITY_DEMO_MODE", "1") in ("1", "true", "True")
    UNITY_DEMO_MODE: bool = True

settings = Settings()
