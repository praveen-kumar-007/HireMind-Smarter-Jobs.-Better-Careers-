from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User, UserPlatformCredential
from app.schemas.credentials import CredentialCreate, CredentialUpdate, CredentialResponse
from app.routers.deps import get_current_user

router = APIRouter(prefix="/settings/credentials", tags=["credentials"])

@router.get("", response_model=List[CredentialResponse])
def get_user_credentials(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all credentials stored for the current user."""
    credentials = db.query(UserPlatformCredential).filter(
        UserPlatformCredential.user_id == current_user.id
    ).all()
    return credentials

@router.post("", response_model=CredentialResponse, status_code=status.HTTP_201_CREATED)
def save_user_credentials(
    request: CredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save or update login credentials for a specific job board platform or email account."""
    # Check if credential already exists for this platform
    cred = db.query(UserPlatformCredential).filter(
        UserPlatformCredential.user_id == current_user.id,
        UserPlatformCredential.platform == request.platform.lower().strip()
    ).first()

    if cred:
        # Update existing
        cred.username = request.username
        cred.password = request.password
        cred.is_active = request.is_active
        cred.extra_data = request.extra_data
    else:
        # Create new
        cred = UserPlatformCredential(
            user_id=current_user.id,
            platform=request.platform.lower().strip(),
            username=request.username,
            password=request.password,
            is_active=request.is_active,
            extra_data=request.extra_data
        )
        db.add(cred)

    db.commit()
    db.refresh(cred)
    return cred

@router.delete("/{platform}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_credentials(
    platform: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete credentials for a given platform."""
    cred = db.query(UserPlatformCredential).filter(
        UserPlatformCredential.user_id == current_user.id,
        UserPlatformCredential.platform == platform.lower().strip()
    ).first()

    if not cred:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credentials for platform '{platform}' not found."
        )

    db.delete(cred)
    db.commit()
    return
