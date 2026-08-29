import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, JSON
from sqlalchemy.orm import relationship
from app.db.session import Base

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String(255), unique=True, index=True, nullable=False) # Extracted/Normalized unique external job identifier
    title = Column(String(255), index=True, nullable=False)
    company = Column(String(255), index=True, nullable=False)
    location = Column(String(255), nullable=True)
    salary = Column(String(100), nullable=True)
    experience = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    url = Column(String(500), nullable=True)
    source = Column(String(100), index=True, nullable=False) # e.g. linkedin, naukri, indeed, internshala, foundit, workindia
    posted_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    skills = relationship("JobSkill", back_populates="job", cascade="all, delete-orphan")
    job_matches = relationship("JobMatch", back_populates="job", cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")


class JobSkill(Base):
    __tablename__ = "job_skills"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), index=True, nullable=False)

    # Relationship
    job = relationship("Job", back_populates="skills")


class JobMatch(Base):
    __tablename__ = "job_matches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    resume_version_id = Column(Integer, ForeignKey("resume_versions.id", ondelete="CASCADE"), nullable=False)
    
    # Matching breakdown (0 to 100)
    match_score = Column(Float, default=0.0)
    skill_match = Column(Float, default=0.0)
    experience_match = Column(Float, default=0.0)
    education_match = Column(Float, default=0.0)
    location_match = Column(Float, default=0.0)
    
    # Extra data like missing skills, certification recommendations, reasons, learning roadmaps
    details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="job_matches")
    job = relationship("Job", back_populates="job_matches")
    resume_version = relationship("ResumeVersion", back_populates="job_matches")
