from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class EscalationCreate(BaseModel):
    kind: Optional[str] = "general"
    reason: str
    region: Optional[str] = None
    site: Optional[str] = None

class EscalationForwardRequest(BaseModel):
    triage_note: Optional[str] = "Forwarded to State EOC for higher-tier resource surge."

class EscalationOut(BaseModel):
    id: str
    origin_user_id: Optional[str] = None
    origin_credential_id: Optional[str] = None
    origin_role: str
    routed_to_tier: str
    region: Optional[str] = None
    site: Optional[str] = None
    kind: Optional[str] = None
    reason: str
    status: str
    triage_note: Optional[str] = None
    created_at: Optional[datetime] = None
    actioned_at: Optional[datetime] = None

    class Config:
        from_attributes = True
