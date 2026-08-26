from sqlalchemy import Column, String, Integer, Float, DateTime
from datetime import datetime
from ..database import Base

class Site(Base):
    __tablename__ = "sites"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    region = Column(String(50), nullable=False)
    site = Column(String(100), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    severity_level = Column(String(20), default="GREEN") # 'GREEN', 'YELLOW', 'AMBER', 'RED', 'CRITICAL'
    active_incidents = Column(Integer, default=0)
    assigned_coordinator = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
