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
    db.commit()
    db.refresh(version)
    
    # Reindex sections in FAISS since skills or experiences might have changed
    resume_service.index_resume_version_in_faiss(current_user.id, version)
    
    return version
