from sqlalchemy import Column, String, Float, DateTime
from datetime import datetime
from ..database import Base

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(50), primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    details = Column(String(500), nullable=True)
    section = Column(String(50), default="OPS") # 'OPS', 'LOGISTICS', 'PLANNING', 'COMMS', 'IMD'
    severity = Column(String(20), default="MEDIUM") # 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'
    location = Column(String(200), nullable=True)
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    status = Column(String(50), default="IN PROGRESS")
    time = Column(String(50), nullable=True)
    mode = Column(String(20), default="LIVE") # 'LIVE' or 'EXERCISE'
    created_at = Column(DateTime, default=datetime.utcnow)

class CitizenSOS(Base):
    __tablename__ = "citizen_sos"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=True)
    msg = Column(String(500), nullable=False)
    location = Column(String(200), nullable=False)
    urgency = Column(String(20), default="CRITICAL")
    time = Column(String(50), nullable=True)
    assigned_unit = Column(String(100), default="Awaiting Dispatch")
    status = Column(String(30), default="ACTIVE")
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
