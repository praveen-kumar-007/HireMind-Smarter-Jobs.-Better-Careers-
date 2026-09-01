from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.db.session import get_db
from app.models.user import User, Profile
from app.models.resume import Resume
from app.models.application import Application
from app.routers.deps import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])

def require_admin(current_user: User = Depends(get_current_user)):
    """Enforces that only admin (e.g. praveen.pr105@gmail.com) can access admin routes."""
    if current_user.role != "admin" and current_user.email.lower().strip() != "praveen.pr105@gmail.com":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden. Only Administrator (praveen.pr105@gmail.com) can manage approvals."
        )
    return current_user

class AdminUserItem(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    is_approved: bool
    full_name: Optional[str] = ""
    location: Optional[str] = ""
    experience_level: Optional[str] = "junior"
    target_roles: Optional[List[str]] = []
    has_resume: bool = False
    applications_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AdminStatsResponse(BaseModel):
    total_users: int
    pending_approvals: int
    approved_users: int
    active_users: int

@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get high-level user and approval stats for Praveen's dashboard."""
    all_users = db.query(User).all()
    total = len(all_users)
    pending = sum(1 for u in all_users if not getattr(u, "is_approved", True))
    approved = sum(1 for u in all_users if getattr(u, "is_approved", True))
    active = sum(1 for u in all_users if u.is_active)
    
    return {
        "total_users": total,
        "pending_approvals": pending,
        "approved_users": approved,
        "active_users": active
    }

@router.get("/users", response_model=List[AdminUserItem])
def list_all_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Lists all users with their profile metadata and approval status for Praveen."""
    users = db.query(User).order_by(User.id.desc()).all()
    results = []
    
    for u in users:
        p = u.profile
        has_resume = db.query(Resume).filter(Resume.user_id == u.id).first() is not None
        app_count = db.query(Application).filter(Application.user_id == u.id).count()
        
        results.append(AdminUserItem(
            id=u.id,
            email=u.email,
            role=u.role or "user",
            is_active=bool(u.is_active),
            is_approved=bool(getattr(u, "is_approved", True)),
            full_name=p.full_name if p else "",
            location=p.location if p else "",
            experience_level=p.experience_level if p else "junior",
            target_roles=p.target_roles if p and p.target_roles else [],
            has_resume=has_resume,
            applications_count=app_count,
            created_at=u.created_at
        ))
    
    return results

@router.post("/users/{user_id}/approve")
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Approves a newly registered user so they can log in and use HireMind."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    user.is_approved = True
    user.is_active = True
    db.commit()
    
    return {
        "status": "approved",
        "message": f"Successfully approved user '{user.email}'. They can now log in."
    }

@router.post("/users/{user_id}/reject")
def reject_or_deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Rejects / deactivates a user account."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate the primary administrator account.")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    user.is_approved = False
    user.is_active = False
    db.commit()
    
    return {
        "status": "deactivated",
        "message": f"Account '{user.email}' has been deactivated and blocked from login."
    }

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Permanently deletes a user and all their associated data."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete primary administrator account.")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    
    email = user.email
    db.delete(user)
    db.commit()
    
    return {
        "status": "deleted",
        "message": f"Permanently removed user account '{email}'."
    }
