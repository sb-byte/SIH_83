from sqlalchemy import Column, String, DateTime
from datetime import datetime
import uuid
from ..database import Base

class Escalation(Base):
    __tablename__ = "escalations"

    id = Column(String(50), primary_key=True, default=lambda: f"ESC-{uuid.uuid4().hex[:6].upper()}")
    origin_user_id = Column(String(36), nullable=True)
    origin_credential_id = Column(String(50), nullable=True)
    origin_role = Column(String(10), nullable=False) # 'T2', 'T3', 'T4', 'T5'
    routed_to_tier = Column(String(10), nullable=False) # 'T1', 'T2', 'T3'
    
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    
    kind = Column(String(50), default="general") # 'resource_request', 'backup_request', 'evacuation_surge', 'general'
    reason = Column(String(1000), nullable=False)
    status = Column(String(20), default="pending") # 'pending', 'approved', 'denied', 'forwarded'
    triage_note = Column(String(500), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    actioned_at = Column(DateTime, nullable=True)
    actioned_by_credential = Column(String(50), nullable=True)
