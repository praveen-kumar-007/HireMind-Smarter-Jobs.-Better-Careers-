from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.models.job import Job, JobMatch
from app.models.resume import Resume, ResumeVersion
from app.schemas.match import MatchRequest, MatchResponse
from app.routers.deps import get_current_user
from app.services.match_service import match_service
from app.services.ai_service import ai_service

router = APIRouter(prefix="/match", tags=["matching"])

@router.post("", response_model=MatchResponse)
def calculate_job_match(
    request: MatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Fetch the Job listing
    job = db.query(Job).filter(Job.id == request.job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job listing not found."
        )

    # 2. Fetch the Resume Version
    version = None
    if request.resume_version_id:
        version = db.query(ResumeVersion).join(Resume).filter(
            ResumeVersion.id == request.resume_version_id,
            Resume.user_id == current_user.id
        ).first()
    else:
        # Use latest active resume version
        resume = db.query(Resume).filter(
            Resume.user_id == current_user.id,
            Resume.is_active == True
        ).first()
        if resume:
            version = db.query(ResumeVersion).filter(
                ResumeVersion.resume_id == resume.id
            ).order_by(ResumeVersion.version.desc()).first()
            
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No valid resume version found. Please upload a resume first."
        )

    # 3. Gather texts and lists for matcher
    resume_text = json_to_text_representation(version.parsed_data)
    job_desc = job.description or ""
    
    resume_skills = [s.name for s in version.skills]
    job_skills = [s.name for s in job.skills]
    
    resume_location = version.parsed_data.get("location", "")
    job_location = job.location or ""
    
    job_exp = job.experience or ""
    
    # 4. Calculate Scores
    scores = match_service.calculate_match_score(
        resume_text=resume_text,
        job_desc=job_desc,
        resume_skills=resume_skills,
        job_skills=job_skills,
        resume_location=resume_location,
        job_location=job_location,
        resume_exp_years=2.0, # default
        job_exp_desc=job_exp
    )

    # 5. Call LLM agent for tailored suggestions and certifications
    primary_model = current_user.profile.primary_model or "qwen3:8b"
    temp = current_user.profile.ai_temperature or 0.7
    timeout = current_user.profile.ai_timeout or 120

    ai_suggestions = ai_service.analyze_improvements(
        resume_data=version.parsed_data,
        job_description=job_desc,
        model_override=primary_model,
        temperature=temp,
        timeout_override=timeout
    )
    ai_explanation = ai_service.explain_match_score(
        resume_data=version.parsed_data,
        job_title=job.title,
        job_desc=job_desc,
        match_score=scores["match_score"],
        model_override=primary_model,
        temperature=temp,
        timeout_override=timeout
    )
    
    # Merge findings
    details = {
        "missing_skills": scores["missing_skills"],
        "improvements": ai_suggestions.get("improvements", []),
        "certifications": ai_suggestions.get("certifications", []),
        "learning_roadmap": ai_suggestions.get("learning_roadmap", []),
        "strengths": ai_explanation.get("strengths", []),
        "gaps": ai_explanation.get("gaps", []),
        "recommendation": ai_explanation.get("recommendation", "MEDIUM_MATCH")
    }

    # 6. Save Match Record
    # Delete old match for this job & resume version if exists
    existing_match = db.query(JobMatch).filter(
        JobMatch.user_id == current_user.id,
        JobMatch.job_id == job.id,
        JobMatch.resume_version_id == version.id
    ).first()
    if existing_match:
        db.delete(existing_match)
        db.commit()

    db_match = JobMatch(
        user_id=current_user.id,
        job_id=job.id,
        resume_version_id=version.id,
        match_score=scores["match_score"],
        skill_match=scores["skill_match"],
        experience_match=scores["experience_match"],
        education_match=scores["education_match"],
        location_match=scores["location_match"],
        details=details
    )
    db.add(db_match)
    db.commit()
    db.refresh(db_match)

    return db_match

def json_to_text_representation(parsed_data: dict) -> str:
    """Helper to convert structured resume JSON to a standard paragraph text format."""
    text_blocks = []
    
    # Header
    text_blocks.append(f"Name: {parsed_data.get('name', '')}")
    text_blocks.append(f"Skills: {', '.join(parsed_data.get('skills', []))}")
    
    # Experience
    for exp in parsed_data.get("experience", []):
        text_blocks.append(f"Worked at {exp.get('company', '')} as a {exp.get('title', '')}: {exp.get('description', '')}")
        
    # Education
    for edu in parsed_data.get("education", []):
        text_blocks.append(f"Studied at {edu.get('institution', '')}, Degree: {edu.get('degree', '')} in {edu.get('field_of_study', '')}")
        
    # Projects
    for proj in parsed_data.get("projects", []):
        text_blocks.append(f"Project: {proj.get('title', '')} - Description: {proj.get('description', '')}")
        
    return "\n".join(text_blocks)
