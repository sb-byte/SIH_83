from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import AuditLog, User
from ..core.dependencies import get_current_user
from ..core.scope import filter_scoped

router = APIRouter(tags=["Security & Audit Trail"])

class AuditCreateRequest(BaseModel):
    action: str
    target_entity: Optional[str] = None
    status: Optional[str] = "SUCCESS"
    metadata_json: Optional[str] = None

def _fetch_audit_logs(current_user: User, db: Session):
    """Retrieve immutable audit log scoped by tier clearance and jurisdiction."""
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100).all()

    # Tier 1 sees all audit entries (National Oversight)
    if current_user.role == "T1":
        scoped = logs
    elif current_user.role == "T2":
        scoped = [l for l in logs if not l.region or l.region == current_user.region]
    elif current_user.role == "T3":
        scoped = [l for l in logs if not l.site or l.site == current_user.site]
    else:
        # Tier 4 & 5 see own actions only
        scoped = [l for l in logs if l.credential_id == current_user.credential_id or l.user_id == current_user.id]

    data = [
        {
            "id": l.id,
            "ts": l.timestamp.isoformat() if l.timestamp else None,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "credential_id": l.credential_id,
            "role": l.role,
            "region": l.region,
            "site": l.site,
            "action": l.action,
            "target_entity": l.target_entity,
            "status": l.status,
            "metadata": l.metadata_json
        }
        for l in scoped
    ]

    return data

@router.get("/audit")
def get_audit_trail(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = _fetch_audit_logs(current_user, db)
    return {"ok": True, "data": data}

@router.get("/audit-log")
def get_audit_log(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return _fetch_audit_logs(current_user, db)

@router.post("/audit")
@router.post("/audit-log")
def create_audit_entry(
    req: AuditCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Write audit log entry directly to PostgreSQL database table."""
    entry = AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=current_user.region,
        site=current_user.site,
        action=req.action,
        target_entity=req.target_entity,
        status=req.status or "SUCCESS",
        metadata_json=req.metadata_json
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"ok": True, "id": entry.id}
