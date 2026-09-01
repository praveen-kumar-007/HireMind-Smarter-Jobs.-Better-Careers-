from typing import List, Optional
from pydantic import BaseModel
import datetime

class ApplicationAnswerSchema(BaseModel):
    id: int
    question: str
    answer: str
    is_generated: bool

    class Config:
        from_attributes = True

class ApplicationAnswerCreate(BaseModel):
    question: str
    answer: str

class ApplicationEventCreate(BaseModel):
    step: str
    progress: int = 0
    status_text: str
    is_error: bool = False

class ApplicationStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

class ApplicationCreate(BaseModel):
    job_id: int

class ApplicationUpdate(BaseModel):
    status: str # Saved, Matched, Review Required, Ready, Applied, Rejected, Interview, Offer, Joined
    notes: Optional[str] = None
    applied_date: Optional[datetime.datetime] = None

from app.schemas.job import JobResponse

class ApplicationResponse(BaseModel):
    id: int
    user_id: int
    job_id: int
    company: str
    title: str
    source: Optional[str] = None
    match_score: float
    status: str
    applied_date: Optional[datetime.datetime] = None
    notes: Optional[str] = None
    created_at: datetime.datetime
    answers: List[ApplicationAnswerSchema] = []
    job: Optional[JobResponse] = None

    class Config:
        from_attributes = True
