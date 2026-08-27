from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from ..database import get_db
from ..models import (
    RadioChannel, VolunteerSquad, VolunteerPool, RumorDebunking,
    DamageAssessment, ICSCommandNode, HazardOverlay, AuditLog, User
)
from ..schemas.auxiliary import (
    RadioChannelOut, VolunteerSquadOut, VolunteerCreate, VolunteerOut,
    RumorCreate, RumorOut, DamageAssessmentCreate, DamageAssessmentOut,
    ICSCommandNodeOut, HazardOverlayOut
)
from ..core.dependencies import get_current_user, get_current_user_optional
from ..core.scope import filter_scoped, ensure_in_scope
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="", tags=["Auxiliary Domain Entities"])

# ---- Radio Channels ----
@router.get("/radio-channels", response_model=List[RadioChannelOut])
def get_radio_channels(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    channels = db.query(RadioChannel).all()
    if not current_user:
        return channels
    # Filter by tier clearance
    return [c for c in channels if current_user.role in (c.allowed_tiers or [])]

# ---- Volunteer Squads ----
@router.get("/volunteer-squads", response_model=List[VolunteerSquadOut])
def get_volunteer_squads(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    squads = db.query(VolunteerSquad).all()
    if not current_user:
        return squads
    return filter_scoped(current_user, squads)

# ---- Volunteer Pool ----
@router.get("/volunteer-pool", response_model=List[VolunteerOut])
def get_volunteer_pool(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    volunteers = db.query(VolunteerPool).filter(VolunteerPool.status != "REMOVED").all()
    if not current_user:
        return volunteers
    return filter_scoped(current_user, volunteers)

@router.post("/volunteer-pool", response_model=VolunteerOut, status_code=status.HTTP_201_CREATED)
async def register_volunteer(
    req: VolunteerCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_region = current_user.region or req.region or "Odisha"
    target_site = current_user.site or req.site or "Kendrapara Sector"

    vol_id = f"VOL-{uuid.uuid4().hex[:4].upper()}"
    new_vol = VolunteerPool(
        id=vol_id,
        name=req.name,
        phone=req.phone,
        skills=req.skills or "General Support",
        status="UNASSIGNED",
        assigned_squad=req.assigned_squad,
        region=target_region,
        site=target_site
    )
    db.add(new_vol)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        site=target_site,
        action="REGISTER_VOLUNTEER",
        target_entity=vol_id,
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_vol)

    await ws_manager.broadcast("volunteer_registered", {
        "id": new_vol.id,
        "name": new_vol.name,
        "skills": new_vol.skills,
        "status": new_vol.status
    })
    return new_vol

@router.delete("/volunteer-pool/{vol_id}", response_model=VolunteerOut)
async def remove_volunteer(
    vol_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    vol = db.query(VolunteerPool).filter(VolunteerPool.id == vol_id).first()
    ensure_in_scope(current_user, vol, "Volunteer")

    vol.status = "REMOVED"
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=vol.region,
        site=vol.site,
        action="REMOVE_VOLUNTEER",
        target_entity=vol.id,
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(vol)

    await ws_manager.broadcast("volunteer_removed", {"id": vol.id})
    return vol

# ---- Rumors Debunking ----
@router.get("/rumors", response_model=List[RumorOut])
def get_rumors(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    rumors = db.query(RumorDebunking).all()
    if not current_user:
        return rumors
    return filter_scoped(current_user, rumors)

@router.post("/rumors", response_model=RumorOut, status_code=status.HTTP_201_CREATED)
async def add_rumor(
    req: RumorCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_region = current_user.region or req.region or "Odisha"
    target_site = current_user.site or req.site or "Operational Sector"

    rmr_id = f"RMR-{uuid.uuid4().hex[:4].upper()}"
    new_rumor = RumorDebunking(
        id=rmr_id,
        rumor=req.rumor,
        verdict=req.verdict or "FALSE / DEBUNKED",
        fact=req.fact,
        source=req.source or current_user.name,
        region=target_region,
        site=target_site
    )
    db.add(new_rumor)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        site=target_site,
        action="ADD_RUMOR",
        target_entity=rmr_id,
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_rumor)

    await ws_manager.broadcast("rumor_added", {
        "id": new_rumor.id,
        "rumor": new_rumor.rumor,
        "verdict": new_rumor.verdict,
        "fact": new_rumor.fact
    })
    return new_rumor

# ---- Damage Assessments ----
@router.get("/damage-assessments", response_model=List[DamageAssessmentOut])
def get_damage_assessments(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    assessments = db.query(DamageAssessment).all()
    if not current_user:
        return assessments
    return filter_scoped(current_user, assessments)

@router.post("/damage-assessments", response_model=DamageAssessmentOut, status_code=status.HTTP_201_CREATED)
async def add_damage_assessment(
    req: DamageAssessmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_region = current_user.region or req.region or "Odisha"
    target_site = current_user.site or req.site or "Kendrapara Sector"

    dmg_id = f"DMG-{uuid.uuid4().hex[:4].upper()}"
    new_dmg = DamageAssessment(
        id=dmg_id,
        structure=req.structure,
        location=req.location,
        lat=req.lat,
        lng=req.lng,
        damage_level=req.damage_level or "MODERATE",
        assessed_by=current_user.name,
        region=target_region,
        site=target_site
    )
    db.add(new_dmg)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        site=target_site,
        action="ADD_DAMAGE_ASSESSMENT",
        target_entity=dmg_id,
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_dmg)

    await ws_manager.broadcast("damage_assessment_added", {
        "id": new_dmg.id,
        "structure": new_dmg.structure,
        "damage_level": new_dmg.damage_level
    })
    return new_dmg

# ---- ICS Command Tree ----
@router.get("/ics-tree")
def get_ics_tree(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    nodes = db.query(ICSCommandNode).all()
    if not nodes:
        return {}
    # Build tree
    root = [n for n in nodes if not n.parent_id]
    if root:
        r = root[0]
        return {
            "role": r.role,
            "name": r.name,
            "agency": r.agency,
            "children": r.children_json or []
        }
    return {}

# ---- Hazard Overlays ----
@router.get("/hazard-overlays", response_model=List[HazardOverlayOut])
def get_hazard_overlays(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    overlays = db.query(HazardOverlay).filter(HazardOverlay.active == 1).all()
    if not current_user:
        return overlays
    return filter_scoped(current_user, overlays)
