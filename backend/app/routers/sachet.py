from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, AuditLog
from ..core.dependencies import get_current_user
from ..core.permissions import can_act
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="/sachet", tags=["CAP-SACHET Alerting"])

class SachetBroadcastRequest(BaseModel):
    event_title: str
    severity: str = "Extreme" # 'Extreme', 'Severe', 'Moderate'
    instruction: str
    geofence_sectors: List[str]
    languages: List[str] = ["en", "hi", "or"]
    mode: Optional[str] = "LIVE"

@router.post("/broadcast")
async def broadcast_cap_alert(
    req: SachetBroadcastRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Transmit CAP-SACHET Emergency Cell Broadcast Alert."""
    mode = req.mode or "LIVE"
    if not can_act(current_user.role, "transmit_sachet", mode):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: Tier {current_user.role} cannot transmit live CAP-SACHET broadcasts in {mode} mode."
        )

    # Audit transmission
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=current_user.region,
        action="TRANSMIT_SACHET_ALERT",
        target_entity=req.event_title,
        status="BROADCAST_TRANSMITTED",
        metadata_json=f'{{"mode": "{mode}", "severity": "{req.severity}", "sectors": {req.geofence_sectors}}}'
    ))
    db.commit()

    # Broadcast alert via WebSockets
    await ws_manager.broadcast("sachet_alert", {
        "title": req.event_title,
        "severity": req.severity,
        "instruction": req.instruction,
        "sectors": req.geofence_sectors,
        "mode": mode,
        "dispatched_by": current_user.name
    })

    return {
        "ok": True,
        "message": f"CAP-SACHET alert dispatched to cell broadcast towers ({mode} Mode).",
        "sectors_targeted": len(req.geofence_sectors)
    }
