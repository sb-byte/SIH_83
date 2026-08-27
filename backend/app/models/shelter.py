from sqlalchemy import Column, String, Integer, Float, DateTime
from datetime import datetime
import uuid
from ..database import Base

class Shelter(Base):
    __tablename__ = "shelters"

    id = Column(String(50), primary_key=True, default=lambda: f"SHL-{uuid.uuid4().hex[:4].upper()}")
    name = Column(String(150), nullable=False)
    capacity = Column(Integer, nullable=False, default=100)
    occupied = Column(Integer, nullable=False, default=0)
    status = Column(String(50), nullable=False, default="OPEN / OPERATIONAL") # 'OPEN / OPERATIONAL', 'NEAR CAPACITY', 'FULL', 'CLOSED'
    region = Column(String(50), nullable=False)
    site = Column(String(100), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    medical = Column(String(100), nullable=True, default="Basic Aid Kit")
    food_rations = Column(String(100), nullable=True, default="Adequate")
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
