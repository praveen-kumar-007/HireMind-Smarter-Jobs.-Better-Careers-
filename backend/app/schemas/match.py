from typing import Dict, Any, Optional
from pydantic import BaseModel
import datetime

class MatchRequest(BaseModel):
    job_id: int
    resume_version_id: Optional[int] = None # If null, use user's latest active resume version

class MatchResponse(BaseModel):
    id: int
    user_id: int
    job_id: int
    resume_version_id: int
    match_score: float
    skill_match: float
    experience_match: float
    education_match: float
    location_match: float
    details: Dict[str, Any] = {}
    created_at: datetime.datetime

    class Config:
        from_attributes = True
