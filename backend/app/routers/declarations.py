from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import hashlib
import uuid
from datetime import datetime

from ..database import get_db
from ..models import Declaration, User, AuditLog
from ..schemas.declaration import DeclarationCreate, DeclarationOut
from ..core.dependencies import get_current_user

router = APIRouter(prefix="/declarations", tags=["Declarations & Statutory IAP Sign-off"])

@router.get("")
def get_declarations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve declarations (T1 full view; T2 status-only view; T3/4/5 blocked -> 403)."""
    if current_user.role in ["T3", "T4", "T5"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Lower operational tiers cannot query statutory declarations."
        )

    decs = db.query(Declaration).all()

    # Tier 2 gets status-only projection (does not leak created_by internal IDs)
    if current_user.role == "T2":
        return [
            {
                "id": d.id,
                "title": d.title,
                "scope": d.scope,
                "status": d.status,
                "certified_at": d.certified_at.isoformat() if d.certified_at else None
            }
            for d in decs
        ]

    # Tier 1 gets full administrative view
    return [
        {
            "id": d.id,
            "issued_by_id": d.issued_by_id,
            "issued_by_name": d.issued_by_name,
            "title": d.title,
            "scope": d.scope,
            "operational_period": d.operational_period,
            "legal_statute": d.legal_statute,
            "digital_signature_hash": d.digital_signature_hash,
            "status": d.status,
            "certified_at": d.certified_at.isoformat() if d.certified_at else None
        }
        for d in decs
    ]

@router.post("", status_code=status.HTTP_201_CREATED)
def create_declaration(
    req: DeclarationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Sign and certify statutory disaster declaration (Tier 1 Authority only; all other tiers -> 403)."""
    if current_user.role != "T1":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: Only Tier 1 National Command Authority can issue declarations (User is {current_user.role})."
        )

    # Validate region scope if given
    known_regions = ["National", "Odisha", "West Bengal", "Assam", "Uttarakhand", "Kerala"]
    if req.region and req.region not in known_regions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot declare disaster over an unknown region: {req.region}"
        )

    sig_payload = f"{current_user.credential_id}:{req.title}:{datetime.utcnow().isoformat()}"
    sig_hash = hashlib.sha256(sig_payload.encode('utf-8')).hexdigest()

    dec_id = f"DEC-{datetime.utcnow().year}-{uuid.uuid4().hex[:4].upper()}"
    new_dec = Declaration(
        id=dec_id,
        issued_by_id=current_user.id,
        issued_by_name=current_user.name,
        title=req.title,
        scope=req.region or req.scope or "National",
        operational_period=req.operational_period or "Operational Period 2",
        legal_statute="Section 50/51 Disaster Management Act 2005",
        digital_signature_hash=sig_hash,
        status="active"
    )
    db.add(new_dec)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        action="ISSUE_DECLARATION",
        target_entity=dec_id,
        status="CERTIFIED_ACTIVE",
        metadata_json=f'{{"sig_hash": "{sig_hash[:16]}..."}}'
    ))
    db.commit()
    db.refresh(new_dec)

    return {"ok": True, "message": "Statutory declaration digitally signed and certified.", "data": {"id": new_dec.id, "hash": sig_hash}}
