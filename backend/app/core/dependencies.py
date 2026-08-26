from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from ..database import get_db
from ..models.user import User
from .security import decode_access_token
from .permissions import can_act

security_bearer = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> User:
    """Extract and validate JWT Bearer token from request."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided."
        )
    
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token."
        )
        
    credential_id = payload.get("credential_id")
    if not credential_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing identity."
        )
        
    user = db.query(User).filter(User.credential_id == credential_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists."
        )
        
    # Check if token was issued before account revocation/logout
    iat = payload.get("iat", 0)
    if user.revoked_at and iat <= user.revoked_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has been revoked by logout."
        )
        
    # Check if role or jurisdiction changed since token was minted
    if (payload.get("role") != user.role or 
        payload.get("region") != user.region or 
        payload.get("site") != user.site):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account clearance or jurisdiction changed; please re-authenticate."
        )
        
    return user

def require_tier(allowed_tiers: List[str]):
    """Guard dependency ensuring the authenticated user possesses an authorized tier."""
    def tier_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_tiers:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires Tier clearance {', '.join(allowed_tiers)} (User is {current_user.role})."
            )
        return current_user
    return tier_checker

def require_action(action_name: str, mode: str = "LIVE"):
    """Guard dependency ensuring the user is authorized for a specific semantic action."""
    def action_checker(current_user: User = Depends(get_current_user)):
        if not can_act(current_user.role, action_name, mode):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Tier {current_user.role} cannot perform action '{action_name}' in {mode} mode."
            )
        return current_user
    return action_checker
