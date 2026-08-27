from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

class RadioChannelOut(BaseModel):
    id: str
    name: str
    frequency: str
    type: str
    allowed_tiers: List[str]
    status: str
    region: Optional[str]
    site: Optional[str]

    class Config:
        from_attributes = True

class VolunteerSquadOut(BaseModel):
    id: str
    name: str
    leader: str
    members_count: int
    sector: str
    contact: Optional[str]
    status: str
    region: Optional[str]
    site: Optional[str]

    class Config:
        from_attributes = True

class VolunteerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    skills: Optional[str] = None
    assigned_squad: Optional[str] = None
    region: Optional[str] = None
    site: Optional[str] = None

class VolunteerOut(BaseModel):
    id: str
    name: str
    phone: Optional[str]
    skills: Optional[str]
    status: str
    assigned_squad: Optional[str]
    region: Optional[str]
    site: Optional[str]
    registered_at: datetime

    class Config:
        from_attributes = True

class RumorCreate(BaseModel):
    rumor: str
    verdict: Optional[str] = "FALSE / DEBUNKED"
    fact: str
    source: Optional[str] = None
    region: Optional[str] = None
    site: Optional[str] = None

class RumorOut(BaseModel):
    id: str
    rumor: str
    verdict: str
    fact: str
    source: Optional[str]
    region: Optional[str]
    site: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class DamageAssessmentCreate(BaseModel):
    structure: str
    location: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    damage_level: Optional[str] = "MODERATE"
    region: Optional[str] = None
    site: Optional[str] = None

class DamageAssessmentOut(BaseModel):
    id: str
    structure: str
    location: str
    lat: Optional[float]
    lng: Optional[float]
    damage_level: str
    assessed_by: Optional[str]
    region: Optional[str]
    site: Optional[str]
    reported_at: datetime

    class Config:
        from_attributes = True

class ICSCommandNodeOut(BaseModel):
    id: str
    role: str
    name: str
    agency: Optional[str]
    contact: Optional[str]
    status: str
    parent_id: Optional[str]
    children_json: Optional[Any]

    class Config:
        from_attributes = True

class HazardOverlayOut(BaseModel):
    id: str
    name: str
    category: str
    region: Optional[str]
    site: Optional[str]
    geojson: Any
    active: int

    class Config:
        from_attributes = True
