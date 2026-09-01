from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from app.models.user import User, Profile
from app.schemas.auth import UserRegister, UserLogin, Token, UserResponse, ProfileUpdate
from app.routers.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    # Check if user already exists
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists.",
        )
    
    # Create new user (praveen.pr105@gmail.com is auto-approved as superadmin; other users require Praveen's approval)
    hashed_password = get_password_hash(user_in.password)
    is_primary = (user_in.email.lower().strip() == "praveen.pr105@gmail.com")
    
    new_user = User(
        email=user_in.email,
        hashed_password=hashed_password,
        role="admin" if is_primary else "user",
        is_active=True,
        is_approved=True if is_primary else False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create associated empty profile
    profile = Profile(
        user_id=new_user.id,
        full_name="",
        target_roles=[],
        preferred_locations=[]
    )
    db.add(profile)
    db.commit()
    db.refresh(new_user) # load relationship
    
    return new_user

@router.post("/login", response_model=Token)
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Please contact Praveen (praveen.pr105@gmail.com).",
        )
    
    # Approval check: Only praveen.pr105@gmail.com is pre-authorized; all other candidates require Praveen's approval
    is_praveen = (user.email.lower().strip() == "praveen.pr105@gmail.com")
    if not is_praveen and not bool(user.is_approved):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is awaiting administrator approval. Please wait for Praveen (praveen.pr105@gmail.com) to approve your signup before logging in.",
        )
    
    # Generate tokens
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/refresh", response_model=Token)
def refresh_token(refresh_token_str: str, db: Session = Depends(get_db)):
    payload = decode_token(refresh_token_str)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )
    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    
    # Issue new access and refresh token
    access_token = create_access_token(subject=user.id)
    new_refresh = create_refresh_token(subject=user.id)
    return {
        "access_token": access_token,
        "refresh_token": new_refresh,
        "token_type": "bearer"
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/profile", response_model=UserResponse)
def update_profile(
    profile_in: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = current_user.profile
    if not profile:
        profile = Profile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)

    # Update profile fields
    for field, value in profile_in.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    
    db.commit()
    db.refresh(current_user)
    return current_user
