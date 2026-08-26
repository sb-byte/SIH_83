import pyotp
from typing import Optional

def generate_totp_secret() -> str:
    """Generate RFC 6238 base32 TOTP secret."""
    return pyotp.random_base32()

def get_current_totp(secret: str) -> str:
    """Get the active 6-digit TOTP code for a secret."""
    totp = pyotp.TOTP(secret, interval=30, digits=6)
    return totp.now()

def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    """Verify 6-digit TOTP code with time drift window."""
    if not secret or not code:
        return False
    
    # Strip any spaces
    cleaned = str(code).strip()
    if not cleaned.isdigit() or len(cleaned) != 6:
        return False
        
    totp = pyotp.TOTP(secret, interval=30, digits=6)
    return totp.verify(cleaned, valid_window=window)
