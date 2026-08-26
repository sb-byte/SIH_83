from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class LoginRequest(BaseModel):
    credential_id: str = Field(..., alias="credential_id")
    password: str
    tfa_code: Optional[str] = None

class DirectoryUserOut(BaseModel):
    credentialId: str
    name: str
    avatar: str
    role: str
    tierName: str
    tierLevel: int
    jurisdictionLabel: str
    region: Optional[str] = None
    site: Optional[str] = None
    team: Optional[str] = None
    requires2FA: bool

class UserOut(DirectoryUserOut):
    userId: str

class PermissionsOut(BaseModel):
    views: List[str]
    defaultView: str
    channels: List[str]
    actions: Dict[str, Dict[str, bool]]
    buttons: Dict[str, Dict[str, bool]]

class LoginResponse(BaseModel):
    success: bool = True
    token: str
    user: UserOut
    permissions: PermissionsOut
