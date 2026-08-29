from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

class CredentialBase(BaseModel):
    platform: str = Field(..., description="Job board platform identifier (e.g. linkedin, naukri, email_imap)")
    username: str = Field(..., description="Account username or email address")
    is_active: bool = True
    extra_data: Dict[str, Any] = Field(default_factory=dict, description="Additional custom settings (IMAP hosts, ports, configs)")

class CredentialCreate(CredentialBase):
    password: str = Field(..., description="Account password")

class CredentialUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    extra_data: Optional[Dict[str, Any]] = None

class CredentialResponse(BaseModel):
    id: int
    platform: str
    username: str
    is_active: bool
    extra_data: Dict[str, Any]

    model_config = {
        "from_attributes": True
    }
