from sqlalchemy import Column, String, Integer, Float, DateTime
from datetime import datetime
from ..database import Base

class Resource(Base):
    __tablename__ = "resources"

    id = Column(String(50), primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False) # 'Water Rescue', 'Heavy Vehicle', 'UAV Drone', 'Aviation', 'Shelter', 'Generator'
    unit = Column(String(100), nullable=True)
    status = Column(String(30), default="AVAILABLE") # 'AVAILABLE', 'DEPLOYED', 'OUT_OF_SERVICE', 'NEAR FULL', 'CRITICAL'
    loc = Column(String(150), nullable=True)
    crew = Column(Integer, default=0)
    fuel = Column(String(20), nullable=True)
    battery = Column(String(20), nullable=True)
    reason = Column(String(200), nullable=True)
    
    # Shelter fields
    capacity = Column(Integer, nullable=True)
    occupied = Column(Integer, nullable=True)
    medical = Column(String(100), nullable=True)
    food_rations = Column(String(100), nullable=True)
    
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class MutualAidCompact(Base):
    __tablename__ = "mutual_aid_compacts"

    id = Column(String(50), primary_key=True, index=True)
    agency = Column(String(100), nullable=False)
    resource = Column(String(100), nullable=False)
    qty = Column(Integer, default=1)
    priority = Column(String(20), default="HIGH")
    status = Column(String(20), default="PENDING") # 'PENDING', 'APPROVED', 'SCHEDULED', 'DENIED'
    requested_at = Column(String(50), nullable=True)
    approved_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
