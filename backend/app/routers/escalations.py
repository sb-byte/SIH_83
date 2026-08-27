from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from ..database import get_db
from ..models import Escalation, User, AuditLog
from ..schemas.escalation import EscalationCreate, EscalationForwardRequest, EscalationOut
from ..core.dependencies import get_current_user, get_current_user_optional
from ..core.scope import row_in_scope
from ..services.escalation_engine import determine_target_tier
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="/escalations", tags=["Escalations"])

@router.get("", response_model=List[EscalationOut])
def get_escalations(
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Retrieve escalations routed to the user's tier or originating from user."""
    all_esc = db.query(Escalation).order_by(Escalation.created_at.desc()).all()

    if not current_user:
        return all_esc

    # Tier 1 sees everything (Apex Authority)
    if current_user.role == "T1":
        return all_esc

    # Tier 2 sees items routed to T2 in their region + items they submitted
    if current_user.role == "T2":
        return [
            e for e in all_esc 
            if (e.routed_to_tier == "T2" and (not e.region or not current_user.region or e.region == current_user.region))
            or (e.origin_user_id == current_user.id or e.origin_credential_id == current_user.credential_id)
        ]

    # Tier 3 sees items routed to T3 for their site/region + items they submitted
    if current_user.role == "T3":
        return [
            e for e in all_esc 
            if (e.routed_to_tier == "T3" and (not e.site or not current_user.site or e.site == current_user.site or e.region == current_user.region))
            or (e.origin_user_id == current_user.id or e.origin_credential_id == current_user.credential_id)
        ]

    # Tier 4 and Tier 5 see items they submitted or belonging to their team/role
    return [
        e for e in all_esc 
        if e.origin_user_id == current_user.id 
        or e.origin_credential_id == current_user.credential_id
        or (e.origin_role == current_user.role and (not e.site or not current_user.site or e.site == current_user.site))
    ]

@router.post("", response_model=EscalationOut, status_code=status.HTTP_201_CREATED)
async def submit_escalation(
    req: EscalationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit a structured escalation request routed upward."""
    target_tier = determine_target_tier(current_user.role)
    esc_id = f"ESC-{uuid.uuid4().hex[:6].upper()}"

    new_esc = Escalation(
        id=esc_id,
        origin_user_id=current_user.id,
        origin_credential_id=current_user.credential_id,
        origin_role=current_user.role,
        routed_to_tier=target_tier,
        region=current_user.region or req.region,
        site=current_user.site or req.site,
        kind=req.kind or "general",
        reason=req.reason,
        status="pending"
    )
    db.add(new_esc)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=new_esc.region,
        site=new_esc.site,
        action="SUBMIT_ESCALATION",
        target_entity=esc_id,
        status=f"ROUTED_TO_{target_tier}"
    ))
    db.commit()
    db.refresh(new_esc)

    # Broadcast new escalation to recipient tier
    await ws_manager.broadcast("escalation_created", {
        "id": new_esc.id,
        "origin_role": new_esc.origin_role,
        "routed_to_tier": new_esc.routed_to_tier,
        "reason": new_esc.reason,
        "region": new_esc.region
    })

    return new_esc

@router.post("/{esc_id}/approve")
async def approve_escalation(
    esc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve escalation request (Tier 1 & Tier 2 in-region only)."""
    if current_user.role not in ["T1", "T2"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: Tier {current_user.role} cannot approve escalations."
        )

    esc = db.query(Escalation).filter(Escalation.id == esc_id).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation request not found.")

    # Region isolation check for Tier 2
    if current_user.role == "T2" and esc.region and current_user.region and esc.region != current_user.region:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Cannot action an escalation from another state/region."
        )

    if esc.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Escalation has already been actioned (current status: {esc.status})."
        )

    esc.status = "approved"
    esc.actioned_at = datetime.utcnow()
    esc.actioned_by_credential = current_user.credential_id

    # Check national override tag
    action_tag = "APPROVE_ESCALATION"
    if current_user.role == "T1" and esc.routed_to_tier != "T1":
        action_tag = "APPROVE_ESCALATION (NATIONAL_OVERRIDE)"

    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=esc.region,
        site=esc.site,
        action=action_tag,
        target_entity=esc_id,
        status="APPROVED"
    ))
    db.commit()

    # Broadcast approval
    await ws_manager.broadcast("escalation_actioned", {
        "id": esc.id,
        "status": "approved",
        "actioned_by": current_user.name
    })

    return {"ok": True, "message": f"Escalation #{esc_id} approved.", "status": "approved"}

@router.post("/{esc_id}/deny")
async def deny_escalation(
    esc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Deny escalation request (Tier 1 & Tier 2 in-region only)."""
    if current_user.role not in ["T1", "T2"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: Tier {current_user.role} cannot deny escalations."
        )

    esc = db.query(Escalation).filter(Escalation.id == esc_id).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation request not found.")

    if current_user.role == "T2" and esc.region and current_user.region and esc.region != current_user.region:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Cannot action an escalation from another state/region."
        )

    if esc.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Escalation has already been actioned (current status: {esc.status})."
        )

    esc.status = "denied"
    esc.actioned_at = datetime.utcnow()
    esc.actioned_by_credential = current_user.credential_id

    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=esc.region,
        site=esc.site,
        action="DENY_ESCALATION",
        target_entity=esc_id,
        status="DENIED"
    ))
    db.commit()

    # Broadcast denial
    await ws_manager.broadcast("escalation_actioned", {
        "id": esc.id,
        "status": "denied",
        "actioned_by": current_user.name
    })

    return {"ok": True, "message": f"Escalation #{esc_id} denied.", "status": "denied"}

@router.post("/{esc_id}/forward")
async def forward_escalation(
    esc_id: str,
    req: EscalationForwardRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Triage and forward escalation up to Tier 2 (Tier 3 Coordinator only)."""
    if current_user.role != "T3":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Forwarding is an exclusive triage capability of Tier 3 Coordinators."
        )

    esc = db.query(Escalation).filter(Escalation.id == esc_id).first()
    if not esc or (esc.site and current_user.site and esc.site != current_user.site):
        raise HTTPException(status_code=404, detail="Escalation request not found in your district.")

    esc.routed_to_tier = "T2"
    esc.triage_note = req.triage_note or f"Forwarded to State EOC by {current_user.name}"
    
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=esc.region,
        site=esc.site,
        action="FORWARD_ESCALATION",
        target_entity=esc_id,
        status="ROUTED_TO_T2"
    ))
    db.commit()

    return {"ok": True, "message": f"Escalation #{esc_id} forwarded to State EOC (Tier 2)."}
