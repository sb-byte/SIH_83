from pydantic import BaseModel
from typing import Optional

class ResourceRequestCreate(BaseModel):
    type: str
    label: str
    reason: str

class MutualAidCreate(BaseModel):
    agency: str
    resource: str
    qty: int = 1
    priority: str = "HIGH"

class ResourceOut(BaseModel):
    id: str
    name: str
    type: str
    unit: Optional[str] = None
    status: str
    loc: Optional[str] = None
    crew: Optional[int] = 0
    fuel: Optional[str] = None
    battery: Optional[str] = None
    reason: Optional[str] = None
    capacity: Optional[int] = None
    occupied: Optional[int] = None
    medical: Optional[str] = None
    food_rations: Optional[str] = None
    region: Optional[str] = None
    site: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    class Config:
        from_attributes = True

class MutualAidOut(BaseModel):
    id: str
    agency: str
    resource: str
    qty: int
    priority: str
    status: str
    requested_at: Optional[str] = None
    approved_by: Optional[str] = None

    class Config:
        from_attributes = True
