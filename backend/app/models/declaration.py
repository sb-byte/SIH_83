from sqlalchemy import Column, String, DateTime
from datetime import datetime
import uuid
from ..database import Base

class Declaration(Base):
    __tablename__ = "declarations"

    id = Column(String(50), primary_key=True, default=lambda: f"DEC-{datetime.utcnow().year}-{uuid.uuid4().hex[:4].upper()}")
    issued_by_id = Column(String(36), nullable=False)
    issued_by_name = Column(String(100), nullable=True)
    title = Column(String(255), nullable=False)
    scope = Column(String(50), default="National") # 'National' or state name
    operational_period = Column(String(100), default="Current Operational Period")
    legal_statute = Column(String(200), default="Section 50/51 Disaster Management Act 2005")
    digital_signature_hash = Column(String(64), nullable=True)
    status = Column(String(20), default="active") # 'draft', 'active', 'superseded', 'closed'
    certified_at = Column(DateTime, default=datetime.utcnow)
