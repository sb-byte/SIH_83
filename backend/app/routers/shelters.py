from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from ..database import get_db
from ..models import Shelter, User, AuditLog
from ..schemas.shelter import ShelterCreate, ShelterUpdate, ShelterOut
from ..core.dependencies import get_current_user, get_current_user_optional, require_action
from ..core.scope import filter_scoped, ensure_in_scope, row_in_scope
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="/shelters", tags=["Shelters"])

@router.get("", response_model=List[ShelterOut])
def get_shelters(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Get all shelters filtered by caller's jurisdiction or all public shelters."""
    shelters = db.query(Shelter).all()
    if not current_user:
        return shelters
    return filter_scoped(current_user, shelters)

@router.get("/{shelter_id}", response_model=ShelterOut)
def get_shelter(
    shelter_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific shelter by ID (returns 404 if out of scope)."""
    shelter = db.query(Shelter).filter(Shelter.id == shelter_id).first()
    return ensure_in_scope(current_user, shelter, "Shelter")

@router.post("", response_model=ShelterOut, status_code=status.HTTP_201_CREATED)
async def create_shelter(
    req: ShelterCreate,
    x_eoc_mode: Optional[str] = Header("LIVE", alias="X-EOC-Mode"),
    current_user: User = Depends(require_action("add_shelter")),
    db: Session = Depends(get_db)
):
    """Register a new shelter facility with atomic audit log write."""
    target_region = req.region or current_user.region or "Odisha"
    target_site = req.site or current_user.site or "Kendrapara Sector"

    shl_id = f"SHL-{uuid.uuid4().hex[:4].upper()}"
    new_shelter = Shelter(
        id=shl_id,
        name=req.name,
        capacity=req.capacity,
        occupied=req.occupied or 0,
        status=req.status or "OPEN / OPERATIONAL",
        region=target_region,
        site=target_site,
        lat=req.lat,
        lng=req.lng,
        medical=req.medical or "Basic Aid Kit",
        food_rations=req.food_rations or "Adequate",
        created_by=current_user.name
    )
    
    db.add(new_shelter)
    # Atomic audit log in same transaction
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        site=target_site,
        action="ADD_SHELTER",
        target_entity=shl_id,
        status="SUCCESS",
        metadata_json=f'{{"name":"{req.name}","capacity":{req.capacity},"mode":"{x_eoc_mode}"}}'
    ))
    db.commit()
    db.refresh(new_shelter)

    # Real-time WebSocket Broadcast
    await ws_manager.broadcast("shelter_created", {
        "id": new_shelter.id,
        "name": new_shelter.name,
        "capacity": new_shelter.capacity,
        "occupied": new_shelter.occupied,
        "status": new_shelter.status,
        "region": new_shelter.region,
        "site": new_shelter.site,
        "lat": new_shelter.lat,
        "lng": new_shelter.lng,
        "medical": new_shelter.medical,
        "food_rations": new_shelter.food_rations
    })

    return new_shelter

@router.patch("/{shelter_id}", response_model=ShelterOut)
async def update_shelter(
    shelter_id: str,
    req: ShelterUpdate,
    x_eoc_mode: Optional[str] = Header("LIVE", alias="X-EOC-Mode"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Adjust shelter occupancy or status with atomic audit log."""
    shelter = db.query(Shelter).filter(Shelter.id == shelter_id).first()
    ensure_in_scope(current_user, shelter, "Shelter")

    if req.name is not None:
        shelter.name = req.name
    if req.capacity is not None:
        shelter.capacity = req.capacity
    if req.occupied is not None:
        shelter.occupied = req.occupied
    if req.status is not None:
        shelter.status = req.status
    if req.medical is not None:
        shelter.medical = req.medical
    if req.food_rations is not None:
        shelter.food_rations = req.food_rations

    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=shelter.region,
        site=shelter.site,
        action="UPDATE_SHELTER",
        target_entity=shelter.id,
        status="SUCCESS",
        metadata_json=f'{{"occupied":{shelter.occupied},"status":"{shelter.status}"}}'
    ))
    db.commit()
    db.refresh(shelter)

    await ws_manager.broadcast("shelter_updated", {
        "id": shelter.id,
        "occupied": shelter.occupied,
        "status": shelter.status,
        "capacity": shelter.capacity
    })

    return shelter
