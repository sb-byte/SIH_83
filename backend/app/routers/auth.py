from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import time
from typing import Optional, List

from ..database import get_db
from ..models import User, AuditLog
from ..schemas.auth import LoginRequest, LoginResponse, UserOut, DirectoryUserOut, PermissionsOut
from ..core.security import verify_password, create_access_token
from ..core.totp import verify_totp, get_current_totp
from ..core.permissions import allowed_views, default_view_for, channels_for, action_perms, button_perms
from ..core.dependencies import get_current_user
from ..config import settings

router = APIRouter(prefix="", tags=["Authentication"])

LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_SECS = 300 # 5 minutes

@router.get("/directory", response_model=dict)
def get_directory(db: Session = Depends(get_db)):
    """Public credential directory (no password hashes or secrets)."""
    users = db.query(User).all()
    out = []
    for u in users:
        out.append(DirectoryUserOut(
            credentialId=u.credential_id,
            name=u.name,
            avatar=u.avatar,
            role=u.role,
            tierName=u.tier_name,
            tierLevel=u.tier_level,
            jurisdictionLabel=u.jurisdiction_label,
            region=u.region,
            site=u.site,
            team=u.team,
            requires2FA=u.requires_2fa
        ))
    return {"users": out}

@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user with scrypt and RFC 6238 TOTP."""
    cred_id = req.credential_id.strip().upper()
    user = db.query(User).filter(User.credential_id == cred_id).first()

    now_ts = time.time()

    # Check brute-force lockout
    if user and user.locked_until and now_ts < user.locked_until:
        retry_after = int(user.locked_until - now_ts)
        # Log lockout attempt
        db.add(AuditLog(
            credential_id=cred_id,
            role=user.role,
            region=user.region,
            site=user.site,
            action="LOGIN_THROTTLED",
            status="LOCKED_OUT",
            metadata_json=f'{{"retry_after": {retry_after}}}'
        ))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Terminal locked for {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)}
        )

    # Validate existence & password
    if not user or not verify_password(req.password, user.password_hash, user.salt):
        if user:
            user.failed_attempts += 1
            if user.failed_attempts >= LOCKOUT_THRESHOLD:
                user.locked_until = now_ts + LOCKOUT_DURATION_SECS
                user.failed_attempts = 0
            db.commit()

        # Audit failure
        db.add(AuditLog(
            credential_id=cred_id,
            role="NONE",
            action="LOGIN_ATTEMPT_FAILED",
            status="REJECTED"
        ))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed. Check your credential ID and password."
        )

    # Check 2FA for Tier 1 & Tier 2
    if user.requires_2fa:
        if not req.tfa_code:
            # Audit challenge
            db.add(AuditLog(
                credential_id=cred_id,
                role=user.role,
                action="2FA_CHALLENGE_ISSUED",
                status="CHALLENGE_REQUIRED"
            ))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": "tfa_required", "message": "Two-Factor Authentication required for executive accounts."}
            )

        if not verify_totp(user.tfa_secret, req.tfa_code):
            user.failed_attempts += 1
            if user.failed_attempts >= LOCKOUT_THRESHOLD:
                user.locked_until = now_ts + LOCKOUT_DURATION_SECS
                user.failed_attempts = 0
            db.commit()

            # Audit 2FA rejection
            db.add(AuditLog(
                credential_id=cred_id,
                role=user.role,
                action="2FA_CHALLENGE_FAILED",
                status="REJECTED"
            ))
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "invalid_tfa", "message": "Incorrect or expired 2FA code."}
            )

    # Success: Reset failed attempts
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()

    # Mint JWT token carrying identity & jurisdiction
    token_data = {
        "sub": user.id,
        "credential_id": user.credential_id,
        "role": user.role,
        "tier_name": user.tier_name,
        "tier_level": user.tier_level,
        "jurisdiction_label": user.jurisdiction_label,
        "region": user.region,
        "site": user.site,
        "team": user.team,
    }
    access_token = create_access_token(token_data)

    # Audit login success
    db.add(AuditLog(
        credential_id=user.credential_id,
        user_id=user.id,
        role=user.role,
        region=user.region,
        site=user.site,
        action="AUTHENTICATION_SUCCESS",
        status="AUTHORIZED"
    ))
    db.commit()

    user_out = UserOut(
        userId=user.id,
        credentialId=user.credential_id,
        name=user.name,
        avatar=user.avatar,
        role=user.role,
        tierName=user.tier_name,
        tierLevel=user.tier_level,
        jurisdictionLabel=user.jurisdiction_label,
        region=user.region,
        site=user.site,
        team=user.team,
        requires2FA=user.requires_2fa
    )

    perms_out = PermissionsOut(
        views=allowed_views(user.role),
        defaultView=default_view_for(user.role),
        channels=channels_for(user.role),
        actions=action_perms(user.role),
        buttons=button_perms(user.role)
    )

    return LoginResponse(
        success=True,
        token=access_token,
        user=user_out,
        permissions=perms_out
    )

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return active authenticated user details and resolved permissions."""
    user_out = UserOut(
        userId=current_user.id,
        credentialId=current_user.credential_id,
        name=current_user.name,
        avatar=current_user.avatar,
        role=current_user.role,
        tierName=current_user.tier_name,
        tierLevel=current_user.tier_level,
        jurisdictionLabel=current_user.jurisdiction_label,
        region=current_user.region,
        site=current_user.site,
        team=current_user.team,
        requires2FA=current_user.requires_2fa
    )

    perms_out = PermissionsOut(
        views=allowed_views(current_user.role),
        defaultView=default_view_for(current_user.role),
        channels=channels_for(current_user.role),
        actions=action_perms(current_user.role),
        buttons=button_perms(current_user.role)
    )

    return {
        "ok": True,
        "user": user_out.model_dump(),
        "permissions": perms_out.model_dump()
    }

@router.post("/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoke session token on logout."""
    current_user.revoked_at = time.time()
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=current_user.region,
        site=current_user.site,
        action="SESSION_TERMINATED",
        status="CLEARED"
    ))
    db.commit()
    return {"ok": True, "message": "Session revoked successfully."}
