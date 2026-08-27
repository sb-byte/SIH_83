from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from ..database import get_db
from ..models import DangerZone, User, AuditLog
from ..schemas.danger_zone import DangerZoneCreate, DangerZoneUpdate, DangerZoneOut
from ..core.dependencies import get_current_user, get_current_user_optional
from ..core.permissions import can_act
from ..core.scope import filter_scoped, ensure_in_scope
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="/danger-zones", tags=["Danger Zones"])

@router.get("", response_model=List[DangerZoneOut])
def get_danger_zones(
    include_resolved: bool = False,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Retrieve danger zones within jurisdiction or all public active danger zones."""
    query = db.query(DangerZone)
    if not include_resolved:
        query = query.filter(DangerZone.resolved_at.is_(None))
    zones = query.order_by(DangerZone.declared_at.desc()).all()
    if not current_user:
        return zones
    return filter_scoped(current_user, zones)

@router.post("", response_model=DangerZoneOut, status_code=status.HTTP_201_CREATED)
async def declare_danger_zone(
    req: DangerZoneCreate,
    x_eoc_mode: Optional[str] = Header("LIVE", alias="X-EOC-Mode"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Declare a new high-risk danger zone with mode-aware RBAC and atomic audit write."""
    mode = (x_eoc_mode or "LIVE").upper()
    if not can_act(current_user.role, "declare_danger_zone", mode):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tier clearance {current_user.role} cannot declare danger zones in {mode} mode."
        )

    target_region = req.region or current_user.region or "Odisha"
    target_site = req.site or current_user.site or "Operational Sector"

    dz_id = f"DZ-{uuid.uuid4().hex[:4].upper()}"
    new_zone = DangerZone(
        id=dz_id,
        title=req.title,
        severity=req.severity or "CRITICAL",
        directive=req.directive,
        lat=req.lat,
        lng=req.lng,
        radius_km=req.radius_km or 5.0,
        region=target_region,
        site=target_site,
        declared_by=current_user.name
    )

    db.add(new_zone)
    # Atomic audit log in same transaction
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        site=target_site,
        action="DECLARE_DANGER_ZONE",
        target_entity=dz_id,
        status="SUCCESS",
        metadata_json=f'{{"title":"{req.title}","severity":"{req.severity}","radius":{req.radius_km},"mode":"{mode}"}}'
    ))
    db.commit()
    db.refresh(new_zone)

    # Real-Time WebSocket broadcast
    await ws_manager.broadcast("danger_zone_declared", {
        "id": new_zone.id,
        "title": new_zone.title,
        "severity": new_zone.severity,
        "directive": new_zone.directive,
        "lat": new_zone.lat,
        "lng": new_zone.lng,
        "radius_km": new_zone.radius_km,
        "region": new_zone.region,
        "site": new_zone.site,
        "declared_by": new_zone.declared_by,
        "declared_at": new_zone.declared_at.isoformat()
    })

    return new_zone

@router.delete("/{zone_id}", response_model=DangerZoneOut)
async def resolve_danger_zone(
    zone_id: str,
    x_eoc_mode: Optional[str] = Header("LIVE", alias="X-EOC-Mode"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Soft-delete / resolve a danger zone preserving history."""
    zone = db.query(DangerZone).filter(DangerZone.id == zone_id).first()
    ensure_in_scope(current_user, zone, "Danger Zone")

    zone.resolved_at = datetime.utcnow()
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=zone.region,
        site=zone.site,
        action="RESOLVE_DANGER_ZONE",
        target_entity=zone.id,
        status="SUCCESS",
        metadata_json=f'{{"resolved_at":"{zone.resolved_at.isoformat()}"}}'
    ))
    db.commit()
    db.refresh(zone)

    await ws_manager.broadcast("danger_zone_resolved", {
        "id": zone.id,
        "resolved_at": zone.resolved_at.isoformat()
    })

    return zone
