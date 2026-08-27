from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from ..database import get_db
from ..models import Resource, MutualAidCompact, Escalation, User, AuditLog
from ..schemas.resource import ResourceOut, ResourceRequestCreate, MutualAidCreate, MutualAidOut
from ..core.dependencies import get_current_user, get_current_user_optional, require_tier
from ..core.scope import filter_scoped, row_in_scope

router = APIRouter(prefix="", tags=["Resources & Logistics"])

@router.get("/resources", response_model=List[ResourceOut])
def get_resources(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Retrieve logistics resources (Tier 5 strictly prohibited -> 403)."""
    if not current_user:
        return db.query(Resource).all()

    if current_user.role == "T5":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Tier 5 Volunteers are prohibited from accessing logistics and resource inventories."
        )

    # Tier 4 only sees own team equipment
    if current_user.role == "T4":
        resources = db.query(Resource).all()
        return [r for r in resources if (r.unit and current_user.team and current_user.team in r.unit) or (r.site == current_user.site)]

    resources = db.query(Resource).all()
    return filter_scoped(current_user, resources)

@router.get("/resources/{resource_id}", response_model=ResourceOut)
def get_resource_by_id(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve single resource by ID (Tier 5 strictly prohibited -> 403)."""
    if current_user.role == "T5":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Tier 5 Volunteers cannot query resource endpoints."
        )

    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    if not resource or not row_in_scope(current_user, resource):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found in your assigned jurisdiction."
        )
    return resource

@router.post("/resources", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
def create_resource(
    req: ResourceOut,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Register a new asset (Tier 2 only; Tier 5 -> 403)."""
    if current_user.role == "T5":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Tier 5 Volunteers cannot register resources."
        )
    if current_user.role not in ["T1", "T2", "T3"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: Tier {current_user.role} may not register fleet assets."
        )

    # Validate jurisdiction
    if req.region and current_user.region and req.region != current_user.region and current_user.role != "T1":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot plant assets outside your assigned state/region."
        )

    target_region = req.region or current_user.region or "Odisha"
    target_site = req.site or current_user.site or "Staging Base"
    new_res = Resource(
        id=req.id or f"ASSET-{uuid.uuid4().hex[:5].upper()}",
        name=req.name,
        type=req.type,
        unit=req.unit,
        status=req.status or "AVAILABLE",
        loc=req.loc,
        crew=req.crew or 0,
        fuel=req.fuel or "100%",
        battery=req.battery or "100%",
        capacity=req.capacity,
        occupied=req.occupied or 0,
        medical=req.medical,
        food_rations=req.food_rations,
        region=target_region,
        site=req.site or current_user.site,
        lat=req.lat,
        lng=req.lng
    )
    db.add(new_res)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        action="REGISTER_ASSET",
        target_entity=new_res.id,
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_res)
    return new_res

@router.post("/resource-requests", status_code=status.HTTP_201_CREATED)
def request_resource(
    req: ResourceRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Coordinator equipment request (Tier 3 -> routes to Tier 2; Tier 5 -> 403)."""
    if current_user.role == "T5":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Tier 5 Volunteers cannot request resource allocations."
        )

    esc_id = f"ESC-{uuid.uuid4().hex[:6].upper()}"
    esc = Escalation(
        id=esc_id,
        origin_user_id=current_user.id,
        origin_credential_id=current_user.credential_id,
        origin_role=current_user.role,
        routed_to_tier="T2",
        region=current_user.region,
        site=current_user.site,
        kind="resource_request",
        reason=f"[{req.type}] {req.label}: {req.reason}",
        status="pending"
    )
    db.add(esc)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=current_user.region,
        site=current_user.site,
        action="SUBMIT_RESOURCE_REQUEST",
        target_entity=esc_id,
        status="PENDING_T2_ACTION"
    ))
    db.commit()
    return {"ok": True, "message": "Resource request dispatched to State EOC (Tier 2).", "data": {"id": esc_id}}

@router.get("/mutual-aid", response_model=List[MutualAidOut])
def get_mutual_aid_compacts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve mutual aid compacts."""
    return db.query(MutualAidCompact).all()

@router.post("/mutual-aid", response_model=MutualAidOut, status_code=status.HTTP_201_CREATED)
def create_mutual_aid(
    req: MutualAidCreate,
    current_user: User = Depends(require_tier(["T2"])),
    db: Session = Depends(get_db)
):
    """Create a mutual aid request (Tier 2 only)."""
    compact_id = f"MA-{uuid.uuid4().hex[:4].upper()}"
    new_ma = MutualAidCompact(
        id=compact_id,
        agency=req.agency,
        resource=req.resource,
        qty=req.qty,
        priority=req.priority,
        status="PENDING",
        requested_at="Just now",
        approved_by=None
    )
    db.add(new_ma)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=current_user.region,
        action="CREATE_MUTUAL_AID",
        target_entity=compact_id,
        status="PENDING"
    ))
    db.commit()
    db.refresh(new_ma)
    return new_ma

@router.post("/mutual-aid/{compact_id}/approve")
def approve_mutual_aid(
    compact_id: str,
    current_user: User = Depends(require_tier(["T1", "T2"])),
    db: Session = Depends(get_db)
):
    """Approve a mutual aid request (Tier 1 & Tier 2)."""
    compact = db.query(MutualAidCompact).filter(MutualAidCompact.id == compact_id).first()
    if not compact:
        raise HTTPException(status_code=404, detail="Mutual aid compact not found.")

    compact.status = "APPROVED"
    compact.approved_by = current_user.name
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        action="APPROVE_MUTUAL_AID",
        target_entity=compact_id,
        status="APPROVED"
    ))
    db.commit()
    return {"ok": True, "message": f"Mutual aid compact #{compact_id} approved by {current_user.name}."}
