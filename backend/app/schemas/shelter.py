from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ShelterCreate(BaseModel):
    name: str
    capacity: int
    occupied: Optional[int] = 0
    status: Optional[str] = "OPEN / OPERATIONAL"
    region: Optional[str] = None
    site: Optional[str] = None
    lat: float
    lng: float
    medical: Optional[str] = "Basic Aid Kit"
    food_rations: Optional[str] = "Adequate"

class ShelterUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None
    occupied: Optional[int] = None
    status: Optional[str] = None
    medical: Optional[str] = None
    food_rations: Optional[str] = None

class ShelterOut(BaseModel):
    id: str
    name: str
    capacity: int
    occupied: int
    status: str
    region: str
    site: str
    lat: float
    lng: float
    medical: Optional[str]
    food_rations: Optional[str]
    created_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
