from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class AuditLogOut(BaseModel):
    id: int
    ts: datetime
    credential_id: Optional[str] = None
    role: Optional[str] = None
    region: Optional[str] = None
    site: Optional[str] = None
    action: str
    target_entity: Optional[str] = None
    status: str
    metadata: Optional[str] = None

    class Config:
        from_attributes = True
