from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime
from ..database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    user_id = Column(String(36), nullable=True)
    credential_id = Column(String(50), nullable=True, index=True)
    role = Column(String(20), nullable=True)
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    action = Column(String(100), nullable=False)
    target_entity = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False)
    metadata_json = Column(Text, nullable=True)
