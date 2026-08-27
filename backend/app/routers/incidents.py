from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from ..database import get_db
from ..models import Incident, CitizenSOS, User, AuditLog
from ..schemas.incident import IncidentCreate, IncidentOut, SOSOut
from ..core.dependencies import get_current_user, get_current_user_optional
from ..core.scope import filter_scoped, row_in_scope
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="", tags=["Incidents & Citizen SOS"])

@router.get("/incidents", response_model=List[IncidentOut])
def get_incidents(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Retrieve raw/verified incident feed."""
    if current_user and current_user.role == "T4":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Tier 4 Frontline operators do not hold a broad incident feed read grant."
        )

    incidents = db.query(Incident).order_by(Incident.created_at.desc()).all()
    if not current_user:
        return incidents
    return filter_scoped(current_user, incidents)

@router.post("/incidents", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
async def log_incident(
    req: IncidentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Log an incident or frontline hazard report."""
    # Check site spoofing for Tier 2/3
    if req.region and current_user.region and req.region != current_user.region:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot log incident in a foreign region ({req.region}) outside user region ({current_user.region})."
        )

    target_region = current_user.region or req.region or "Odisha"
    target_site = req.site or current_user.site or "Operational Sector"

    inc_id = f"INC-{uuid.uuid4().hex[:4].upper()}"
    new_inc = Incident(
        id=inc_id,
        title=req.title,
        details=req.details or req.body or f"Logged by {current_user.name} ({current_user.tier_name})",
        section=req.section or "OPS",
        severity=req.severity or "MEDIUM",
        location=req.location or target_site,
        region=target_region,
        site=target_site,
        lat=req.lat,
        lng=req.lng,
        status="IN PROGRESS",
        time=datetime.utcnow().strftime("%H:%M IST"),
        mode=req.mode or "LIVE"
    )
    db.add(new_inc)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        site=target_site,
        action="LOG_INCIDENT",
        target_entity=inc_id,
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_inc)

    # Broadcast new incident to all connected dashboards
    await ws_manager.broadcast("incident_created", {
        "id": new_inc.id,
        "title": new_inc.title,
        "severity": new_inc.severity,
        "location": new_inc.location,
        "region": new_inc.region,
        "time": new_inc.time
    })

    return new_inc

@router.get("/sos", response_model=List[SOSOut])
def get_sos_queue(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve citizen emergency SOS alerts."""
    sos_list = db.query(CitizenSOS).all()
    return filter_scoped(current_user, sos_list)
