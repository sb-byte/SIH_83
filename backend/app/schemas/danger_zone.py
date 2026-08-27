from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DangerZoneCreate(BaseModel):
    title: str
    severity: Optional[str] = "CRITICAL"
    directive: str
    lat: float
    lng: float
    radius_km: Optional[float] = 5.0
    region: Optional[str] = None
    site: Optional[str] = None

class DangerZoneUpdate(BaseModel):
    title: Optional[str] = None
    severity: Optional[str] = None
    directive: Optional[str] = None
    radius_km: Optional[float] = None

class DangerZoneOut(BaseModel):
    id: str
    title: str
    severity: str
    directive: str
    lat: float
    lng: float
    radius_km: float
    region: str
    site: str
    declared_by: Optional[str]
    declared_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True
