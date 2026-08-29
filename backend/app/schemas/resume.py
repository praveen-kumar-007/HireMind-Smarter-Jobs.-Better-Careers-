from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import datetime

class SkillSchema(BaseModel):
    id: int
    name: str
    category: Optional[str] = None

    class Config:
        from_attributes = True

class ProjectSchema(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    technologies: List[str] = []

    class Config:
        from_attributes = True

class EducationSchema(BaseModel):
    id: int
    institution: str
    degree: Optional[str] = None
    field_of_study: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    gpa: Optional[str] = None

    class Config:
        from_attributes = True

class ExperienceSchema(BaseModel):
    id: int
    company: str
    title: str
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    description: Optional[str] = None

    class Config:
        from_attributes = True

class ResumeVersionResponse(BaseModel):
    id: int
    version: int
    file_path: str
    parsed_data: Dict[str, Any] = {}
    created_at: datetime.datetime
    skills: List[SkillSchema] = []
    projects: List[ProjectSchema] = []
    education: List[EducationSchema] = []
    experience: List[ExperienceSchema] = []

    class Config:
        from_attributes = True

class ResumeResponse(BaseModel):
    id: int
    user_id: int
    file_path: str
    is_active: bool
    created_at: datetime.datetime
    versions: List[ResumeVersionResponse] = []

    class Config:
        from_attributes = True
