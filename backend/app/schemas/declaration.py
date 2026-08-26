from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class DeclarationCreate(BaseModel):
    title: str
    region: Optional[str] = None
    scope: Optional[str] = "National"
    operational_period: Optional[str] = "Operational Period 2"
    status: Optional[str] = "active"

class DeclarationOut(BaseModel):
    id: str
    issued_by_id: str
    issued_by_name: Optional[str] = None
    title: str
    scope: str
    operational_period: str
    legal_statute: str
    digital_signature_hash: Optional[str] = None
    status: str
    certified_at: datetime

    class Config:
        from_attributes = True

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

class AARGenerateRequest(BaseModel):
    crisis_name: str = "Cyclone Dana"
    operational_period: str = "18:00 - 06:00 IST"
    region: Optional[str] = "Odisha"

class AARReportOut(BaseModel):
    report_id: str
    title: str
    generated_at: str
    executive_summary: str
    response_metrics: dict
    damage_audit: dict
    corrective_action_plan: list
