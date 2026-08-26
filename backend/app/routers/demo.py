from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..core.totp import get_current_totp
from ..config import settings

router = APIRouter(prefix="/demo", tags=["Demo Helpers"])

@router.get("/totp/{credential_id}")
def get_demo_totp(
    credential_id: str,
    db: Session = Depends(get_db)
):
    """Demo helper: return active rotating TOTP code for seeded credential when DEMO_MODE is enabled."""
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo TOTP helper is disabled in production."
        )

    user = db.query(User).filter(User.credential_id == credential_id.strip().upper()).first()
    if not user or not user.tfa_secret:
        raise HTTPException(status_code=404, detail="Credential has no 2FA secret registered.")

    code = get_current_totp(user.tfa_secret)
    return {"ok": True, "credential_id": user.credential_id, "code": code}
