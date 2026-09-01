import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.models.resume import Resume, ResumeVersion
from app.schemas.resume import ResumeResponse, ResumeVersionResponse
from app.routers.deps import get_current_user
from app.services.resume_service import resume_service
from app.core.config import settings

router = APIRouter(prefix="/resume", tags=["resume"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=ResumeVersionResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Validate extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in [".pdf", ".docx"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only PDF and DOCX files are allowed."
        )

    # Save original file to disk
    user_upload_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_upload_dir, exist_ok=True)
    
    file_path = os.path.join(user_upload_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # 1. Read file contents
        with open(file_path, "rb") as f:
            content = f.read()

        # 2. Extract text from PDF/DOCX
        text = resume_service.extract_text(file.filename, content)
        if not text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract text from the uploaded file."
            )

        # 3. Parse resume with LLM or fallback heuristics
        parsed_data = resume_service.parse_resume(text, settings.OLLAMA_BASE_URL)

        # 4. Save and index parsed structures
        resume_version = resume_service.save_parsed_resume(
            db=db,
            user_id=current_user.id,
            file_path=file_path,
            parsed_data=parsed_data
        )
        return resume_version

    except Exception as e:
        # Clean up file in case of crash
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while processing the resume: {str(e)}"
        )

@router.get("", response_model=ResumeResponse)
def get_resume(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    resume = db.query(Resume).filter(
        Resume.user_id == current_user.id,
        Resume.is_active == True
    ).first()
    
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume found. Please upload a resume."
        )
    return resume

@router.put("/version/{version_id}", response_model=ResumeVersionResponse)
def update_resume_version_data(
    version_id: int,
    parsed_data_update: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.resume import Skill, Education, Experience, Project
    from app.models.user import Profile
    from app.services.rag_service import rag_service

    # Fetch resume version
    version = db.query(ResumeVersion).join(Resume).filter(
        ResumeVersion.id == version_id,
        Resume.user_id == current_user.id
    ).first()
    
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume version not found."
        )
        
    version.parsed_data = parsed_data_update

    # 1. Synchronize relational skills
    db.query(Skill).filter(Skill.resume_version_id == version.id).delete()
    for s in parsed_data_update.get("skills", []):
        if isinstance(s, str) and s.strip():
            db.add(Skill(resume_version_id=version.id, name=s.strip()))
        elif isinstance(s, dict) and s.get("name"):
            db.add(Skill(resume_version_id=version.id, name=s["name"].strip(), category=s.get("category")))

    # 2. Synchronize relational education
    db.query(Education).filter(Education.resume_version_id == version.id).delete()
    for edu in parsed_data_update.get("education", []):
        if isinstance(edu, dict):
            db.add(Education(
                resume_version_id=version.id,
                institution=edu.get("institution", ""),
                degree=edu.get("degree", ""),
                field_of_study=edu.get("field_of_study", ""),
                start_date=str(edu.get("start_date", "")),
                end_date=str(edu.get("end_date", "")),
                gpa=str(edu.get("gpa", ""))
            ))

    # 3. Synchronize relational experience
    db.query(Experience).filter(Experience.resume_version_id == version.id).delete()
    for exp in parsed_data_update.get("experience", []):
        if isinstance(exp, dict):
            db.add(Experience(
                resume_version_id=version.id,
                company=exp.get("company", ""),
                title=exp.get("title", ""),
                location=exp.get("location", ""),
                start_date=str(exp.get("start_date", "")),
                end_date=str(exp.get("end_date", "")),
                description=exp.get("description", "")
            ))

    # 4. Synchronize relational projects
    db.query(Project).filter(Project.resume_version_id == version.id).delete()
    for proj in parsed_data_update.get("projects", []):
        if isinstance(proj, dict):
            db.add(Project(
                resume_version_id=version.id,
                title=proj.get("title", ""),
                description=proj.get("description", ""),
                technologies=proj.get("technologies", [])
            ))

    # 5. Sync profile metadata if provided
    profile = current_user.profile
    if profile:
        if parsed_data_update.get("name"):
            profile.full_name = parsed_data_update["name"]
        if parsed_data_update.get("phone"):
            profile.phone = parsed_data_update["phone"]
        if parsed_data_update.get("location"):
            profile.location = parsed_data_update["location"]
        if parsed_data_update.get("github"):
            profile.github = parsed_data_update["github"]
        if parsed_data_update.get("linkedin"):
            profile.linkedin = parsed_data_update["linkedin"]
        if parsed_data_update.get("portfolio"):
            profile.portfolio = parsed_data_update["portfolio"]

    db.commit()
    db.refresh(version)
    
    # 6. Reindex RAG vector memory for the current user
    if current_user.id in rag_service.vector_store_cache:
        del rag_service.vector_store_cache[current_user.id]
    
    # Pre-warm vector cache with fresh resume chunks
    try:
        rag_service.chunk_candidate_resume(db, current_user.id)
    except Exception as e:
        logger.warning(f"RAG pre-warm notice: {e}")
        
    return version
