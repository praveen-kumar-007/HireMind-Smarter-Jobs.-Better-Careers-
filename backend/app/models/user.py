import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="user") # user, admin
    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=False) # Requires admin approval before login
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    profile = relationship("Profile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    resumes = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
    job_matches = relationship("JobMatch", back_populates="user", cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    analytics_events = relationship("AnalyticsEvent", back_populates="user", cascade="all, delete-orphan")
    credentials = relationship("UserPlatformCredential", back_populates="user", cascade="all, delete-orphan")


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    
    # Candidate Extra Details
    date_of_birth = Column(String(50), nullable=True)
    certifications = Column(JSON, default=list)
    languages = Column(JSON, default=list)
    portfolio = Column(String(255), nullable=True)
    github = Column(String(255), nullable=True)
    linkedin = Column(String(255), nullable=True)
    work_authorization = Column(String(100), default="authorized")
    notice_period = Column(String(50), default="immediate")
    salary_expectation = Column(String(100), nullable=True)

    # Safety and Automation settings
    test_mode = Column(Boolean, default=True)
    max_applications_per_day = Column(Integer, default=10)
    excluded_companies = Column(JSON, default=list)
    excluded_job_titles = Column(JSON, default=list)
    
    # User Preferences
    target_roles = Column(JSON, default=list) # e.g. ["Software Developer", "Backend Developer"]
    preferred_locations = Column(JSON, default=list) # e.g. ["Bangalore", "Remote"]
    remote_preference = Column(String(50), default="any") # remote, hybrid, onsite, any
    min_salary = Column(Float, nullable=True)
    max_salary = Column(Float, nullable=True)
    experience_level = Column(String(50), default="any") # junior, mid, senior, any
    min_match_percentage = Column(Float, default=60.0)
    
    # AI Engine settings
    primary_model = Column(String(50), default="qwen3:8b")
    fast_model = Column(String(50), default="qwen3:4b")
    ai_temperature = Column(Float, default=0.7)
    ai_timeout = Column(Integer, default=120)

    # Relationship
    user = relationship("User", back_populates="profile")


class UserPlatformCredential(Base):
    __tablename__ = "user_platform_credentials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    platform = Column(String(50), nullable=False)  # e.g., 'naukri', 'linkedin', 'email_imap'
    username = Column(String(255), nullable=False)
    password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    extra_data = Column(JSON, default=dict)  # host, port for IMAP

    # Relationship
    user = relationship("User", back_populates="credentials")
