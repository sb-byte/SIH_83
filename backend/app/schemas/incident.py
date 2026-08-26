from pydantic import BaseModel
from typing import Optional

class IncidentCreate(BaseModel):
    title: str
    body: Optional[str] = None
    details: Optional[str] = None
    severity: Optional[str] = "MEDIUM"
    section: Optional[str] = "OPS"
    location: Optional[str] = None
    region: Optional[str] = None
    site: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    mode: Optional[str] = "LIVE"

class IncidentOut(BaseModel):
    id: str
    title: str
    details: Optional[str] = None
    section: Optional[str] = None
    severity: str
    location: Optional[str] = None
    region: Optional[str] = None
    site: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    status: Optional[str] = "IN PROGRESS"
    time: Optional[str] = None
    mode: Optional[str] = "LIVE"

    class Config:
        from_attributes = True

class SOSOut(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    msg: str
    location: str
    urgency: str
    time: Optional[str] = None
    assigned_unit: Optional[str] = None
    status: str
    region: Optional[str] = None
    site: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    class Config:
        from_attributes = True
