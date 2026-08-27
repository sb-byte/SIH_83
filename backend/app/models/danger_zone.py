from sqlalchemy import Column, String, Float, DateTime
from datetime import datetime
import uuid
from ..database import Base

class DangerZone(Base):
    __tablename__ = "danger_zones"

    id = Column(String(50), primary_key=True, default=lambda: f"DZ-{uuid.uuid4().hex[:4].upper()}")
    title = Column(String(200), nullable=False)
    severity = Column(String(20), nullable=False, default="CRITICAL") # 'CRITICAL', 'HIGH', 'WARNING'
    directive = Column(String(500), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    radius_km = Column(Float, nullable=False, default=5.0)
    region = Column(String(50), nullable=False)
    site = Column(String(100), nullable=False)
    declared_by = Column(String(100), nullable=True)
    declared_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
