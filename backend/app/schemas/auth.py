from typing import Optional, List
from pydantic import BaseModel, EmailStr

class UserRegister(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    type: Optional[str] = None

class ProfileBase(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    date_of_birth: Optional[str] = None
    certifications: Optional[List[str]] = []
    languages: Optional[List[str]] = []
    portfolio: Optional[str] = None
    github: Optional[str] = None
    linkedin: Optional[str] = None
    work_authorization: Optional[str] = "authorized"
    notice_period: Optional[str] = "immediate"
    salary_expectation: Optional[str] = None
    test_mode: Optional[bool] = True
    max_applications_per_day: Optional[int] = 10
    excluded_companies: Optional[List[str]] = []
    excluded_job_titles: Optional[List[str]] = []
    target_roles: Optional[List[str]] = []
    preferred_locations: Optional[List[str]] = []
    remote_preference: Optional[str] = "any"
    min_salary: Optional[float] = None
    max_salary: Optional[float] = None
    experience_level: Optional[str] = "any"
    min_match_percentage: Optional[float] = 60.0
    primary_model: Optional[str] = "qwen3:8b"
    fast_model: Optional[str] = "qwen3:4b"
    ai_temperature: Optional[float] = 0.7
    ai_timeout: Optional[int] = 120

class ProfileUpdate(ProfileBase):
    pass

class ProfileResponse(ProfileBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    role: str
    is_active: bool
    is_approved: bool = True
    profile: Optional[ProfileResponse] = None

    class Config:
        from_attributes = True

