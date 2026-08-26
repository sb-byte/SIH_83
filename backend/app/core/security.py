import hashlib
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import jwt, JWTError
from ..config import settings

def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """
    Hash password with scrypt matching the server security spec (N=16384, r=8, p=1, key_len=32).
    Returns (hash_hex, salt_hex).
    """
    if not salt:
        salt = os.urandom(16).hex()
    
    salt_bytes = bytes.fromhex(salt) if isinstance(salt, str) else salt
    key = hashlib.scrypt(
        password.encode('utf-8'),
        salt=salt_bytes,
        n=16384,
        r=8,
        p=1,
        maxmem=32 * 1024 * 1024,
        dklen=32
    )
    return key.hex(), salt

def verify_password(password: str, hash_hex: str, salt_hex: str) -> bool:
    """Verify password against scrypt hash."""
    calc_hash, _ = hash_password(password, salt_hex)
    return calc_hash == hash_hex

def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Create signed HS256 JWT containing identity + jurisdiction + role."""
    to_encode = data.copy()
    now = datetime.utcnow()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp())
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and verify HS256 JWT."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None
