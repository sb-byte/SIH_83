from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from ..database import get_db
from ..models import AuditLog, User
from ..core.dependencies import get_current_user
from ..core.scope import filter_scoped

router = APIRouter(prefix="/audit", tags=["Security & Audit Trail"])

@router.get("")
def get_audit_trail(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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

    return {"ok": True, "data": data}
