from typing import List, Optional
from pydantic import BaseModel
import datetime

class JobSkillResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

class JobResponse(BaseModel):
    id: int
    job_id: str
    title: str
    company: str
    location: Optional[str] = None
    salary: Optional[str] = None
    experience: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    source: str
    posted_date: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    skills: List[JobSkillResponse] = []

    class Config:
        from_attributes = True
