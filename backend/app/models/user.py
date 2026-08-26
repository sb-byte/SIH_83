from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime
from datetime import datetime
import uuid
from ..database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    credential_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    avatar = Column(String(10), default="NDMA")
    role = Column(String(10), nullable=False)  # 'T1', 'T2', 'T3', 'T4', 'T5'
    tier_name = Column(String(100), nullable=False)
    tier_level = Column(Integer, nullable=False)
    jurisdiction_label = Column(String(150), nullable=False)
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    team = Column(String(100), nullable=True)
    
    password_hash = Column(String(255), nullable=False)
    salt = Column(String(64), nullable=False)
    tfa_secret = Column(String(64), nullable=True)
    requires_2fa = Column(Boolean, default=False)
    
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(Float, nullable=True)
    revoked_at = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
