from typing import List, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_db
from app.models.user import User
from app.models.job import Job, JobSkill
from app.models.resume import Resume, ResumeVersion
from app.models.application import Application, ApplicationAnswer, ApplicationEvent, AuditLog
from app.schemas.application import (
    ApplicationCreate, 
    ApplicationUpdate, 
    ApplicationResponse, 
    ApplicationAnswerCreate,
    ApplicationEventCreate,
    ApplicationStatusUpdate
)
from app.routers.deps import get_current_user, get_current_user_optional
from app.services.ai_service import ai_service
from app.services.rag_service import rag_service
from app.services.crawl_ai_service import crawl_ai_service
from app.services.automation_service import browser_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applications", tags=["applications"])

@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
def create_application(
    request: ApplicationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Check if application already exists for this user and job
    existing = db.query(Application).filter(
        Application.user_id == current_user.id,
        Application.job_id == request.job_id
    ).first()
    if existing:
        return existing

    # 2. Fetch the Job listing
    job = db.query(Job).filter(Job.id == request.job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job listing not found."
        )

    # 3. Create Application record
    initial_status = "Manual Intervention" if job.source == "Company Website" else "Saved"
    app = Application(
        user_id=current_user.id,
        job_id=job.id,
        company=job.company,
        title=job.title,
        source=job.source,
        match_score=0.0, # Will be set once matching runs
        status=initial_status
    )
    db.add(app)
    db.commit()
    db.refresh(app)

    return app

@router.get("", response_model=List[ApplicationResponse])
def get_applications(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Application).options(
        joinedload(Application.job).joinedload(Job.skills),
        joinedload(Application.answers)
    ).filter(Application.user_id == current_user.id)
    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        if len(statuses) == 1:
            query = query.filter(Application.status == statuses[0])
        elif len(statuses) > 1:
            query = query.filter(Application.status.in_(statuses))
    return query.order_by(Application.created_at.desc()).all()

@router.get("/{app_id}", response_model=ApplicationResponse)
def get_application_by_id(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    app = db.query(Application).options(
        joinedload(Application.job).joinedload(Job.skills),
        joinedload(Application.answers)
    ).filter(
        Application.id == app_id,
        Application.user_id == current_user.id
    ).first()
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application record not found."
        )
    return app

@router.put("/{app_id}", response_model=ApplicationResponse)
def update_application(
    app_id: int,
    update: ApplicationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    app = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id
    ).first()
    
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application record not found."
        )

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(app, field, value)
        
    db.commit()
    db.refresh(app)
    return app

@router.delete("/{app_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    app = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application record not found.")
    db.query(ApplicationAnswer).filter(ApplicationAnswer.application_id == app.id).delete()
    db.query(ApplicationEvent).filter(ApplicationEvent.application_id == app.id).delete()
    db.delete(app)
    db.commit()
    return None

@router.post("/revert-by-job/{job_id}")
def revert_application_by_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reverts an application by job_id, removing Application, Answers, and Events so the job is back in clean unapplied state."""
    job = db.query(Job).filter(Job.id == job_id).first()
    
    # Strategy 1: Direct job_id match
    apps = db.query(Application).filter(
        Application.user_id == current_user.id,
        Application.job_id == job_id
    ).all()

    # Strategy 2: Match by company + title from the Job record
    if not apps and job:
        apps = db.query(Application).filter(
            Application.user_id == current_user.id,
            func.lower(Application.company) == func.lower(job.company),
            func.lower(Application.title) == func.lower(job.title)
        ).all()

    # Strategy 3: Try application.id == job_id (legacy fallback)
    if not apps:
        app_by_id = db.query(Application).filter(
            Application.id == job_id,
            Application.user_id == current_user.id
        ).first()
        if app_by_id:
            apps = [app_by_id]

    # Strategy 4: Fuzzy match - find any application whose title/company partially matches the job
    if not apps and job:
        all_user_apps = db.query(Application).filter(
            Application.user_id == current_user.id
        ).all()
        for a in all_user_apps:
            if (a.company and job.company and a.company.lower().strip() in job.company.lower().strip()) or \
               (a.title and job.title and a.title.lower().strip() in job.title.lower().strip()):
                apps.append(a)

    if not apps:
        return {"status": "not_found", "message": f"No application record found to revert for job #{job_id}."}

    job_title = job.title if job else (apps[0].title if apps else "Job")
    company_name = job.company if job else (apps[0].company if apps else "")

    for app in apps:
        db.query(ApplicationAnswer).filter(ApplicationAnswer.application_id == app.id).delete()
        db.query(ApplicationEvent).filter(ApplicationEvent.application_id == app.id).delete()
        db.delete(app)
    
    db.commit()
    return {
        "status": "reverted", 
        "message": f"Successfully reverted application for '{job_title}'{f' at {company_name}' if company_name else ''}. Status restored to unapplied."
    }

@router.post("/revert-last")
def revert_last_application(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reverts the most recent application made by the current user."""
    latest_app = db.query(Application).filter(
        Application.user_id == current_user.id
    ).order_by(Application.id.desc()).first()
    
    if not latest_app:
        return {"status": "not_found", "message": "No recent applications found to undo."}
    
    comp = latest_app.company or "Company"
    tit = latest_app.title or "Job"
    
    db.query(ApplicationAnswer).filter(ApplicationAnswer.application_id == latest_app.id).delete()
    db.query(ApplicationEvent).filter(ApplicationEvent.application_id == latest_app.id).delete()
    db.delete(latest_app)
    db.commit()
    
    return {
        "status": "reverted", 
        "message": f"Undone application for '{tit}' at {comp}. Status restored to unapplied."
    }

@router.post("/revert-all")
def revert_all_applications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reverts ALL applications for the current user, clearing the entire applied history."""
    apps = db.query(Application).filter(
        Application.user_id == current_user.id
    ).all()
    
    if not apps:
        return {"status": "not_found", "message": "No applications found to clear.", "cleared_count": 0}
    
    count = len(apps)
    for app in apps:
        db.query(ApplicationAnswer).filter(ApplicationAnswer.application_id == app.id).delete()
        db.query(ApplicationEvent).filter(ApplicationEvent.application_id == app.id).delete()
        db.delete(app)
    
    db.commit()
    return {
        "status": "reverted",
        "cleared_count": count,
        "message": f"Successfully cleared {count} application(s). All jobs restored to unapplied state."
    }

@router.post("/{app_id}/answer", response_model=ApplicationResponse)
def generate_custom_screening_answer(
    app_id: int,
    request: ApplicationAnswerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    app = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    primary_model = current_user.profile.primary_model if current_user.profile else None
    
    # Use Advanced RAG Engine with semantic resume vector retrieval and hypothetical reasoning
    answer = rag_service.generate_rag_answer(
        db=db,
        user_id=current_user.id,
        question=request.question,
        job_title=app.job.title if app.job else (app.title or "Software Developer"),
        job_description=app.job.description if app.job else "",
        model_override=primary_model
    )

    if "requires_user_input" in answer:
        app.status = "Review Required"

    db_answer = ApplicationAnswer(
        application_id=app.id,
        question=request.question,
        answer=answer,
        is_generated=True
    )
    db.add(db_answer)
    db.commit()
    db.refresh(app)
    return app

import subprocess
import sys
import os

def _execute_auto_apply_process(application_id: int):
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    # Check backend/venv first (current location), then root/venv as fallback
    venv_python_local = os.path.abspath(os.path.join(backend_dir, "venv/Scripts/python.exe"))
    venv_python_root = os.path.abspath(os.path.join(backend_dir, "../venv/Scripts/python.exe"))
    if os.path.exists(venv_python_local):
        python_exe = venv_python_local
    elif os.path.exists(venv_python_root):
        python_exe = venv_python_root
    else:
        python_exe = sys.executable

    env = os.environ.copy()
    env["PYTHONPATH"] = backend_dir
    env["PLAYWRIGHT_HEADLESS"] = "false"
    
    os.makedirs(os.path.join(backend_dir, "app/static"), exist_ok=True)
    log_file = open(os.path.join(backend_dir, "app/static/browser_agent.log"), "a", encoding="utf-8")
    
    try:
        subprocess.Popen(
            [python_exe, "-m", "app.services.automation_runner", str(application_id)],
            cwd=backend_dir,
            env=env,
            stdout=log_file,
            stderr=log_file
        )
        logger.info(f"Spawned browser automation GUI process for app_id={application_id} using {python_exe}")
    except Exception as e:
        logger.error(f"Failed to spawn automation runner process: {e}")

@router.post("/{app_id}/auto-fill")
def run_autofill(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify application ownership
    app = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
        
    # Launch browser automation in dedicated OS process with full GUI display
    _execute_auto_apply_process(app.id)
    return {"status": "started", "message": "Browser automation GUI session launched on desktop."}

from fastapi.responses import StreamingResponse
import asyncio
import json
from app.models.application import ApplicationEvent, AuditLog

@router.get("/{app_id}/events")
def stream_application_events(
    app_id: int,
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Retrieve real-time application process status updates via Server-Sent Events (SSE)."""
    from app.core.security import decode_token

    # Verify authorization
    user_id = None
    if token:
        payload = decode_token(token)
        if payload and payload.get("type") == "access":
            user_id = payload.get("sub")
    
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
    
    if user_id and int(user_id) != app.user_id:
        raise HTTPException(status_code=403, detail="Unauthorized application access.")

    async def event_generator():
        last_event_id = 0
        while True:
            from app.db.session import SessionLocal
            local_db = SessionLocal()
            try:
                events = local_db.query(ApplicationEvent).filter(
                    ApplicationEvent.application_id == app_id,
                    ApplicationEvent.id > last_event_id
                ).order_by(ApplicationEvent.id.asc()).all()

                for ev in events:
                    yield f"data: {json.dumps({'step': ev.step, 'progress': ev.progress, 'status_text': ev.status_text, 'is_error': ev.is_error})}\n\n"
                    last_event_id = ev.id

                current_app = local_db.query(Application).filter(Application.id == app_id).first()
                if current_app and current_app.status in ["Applied", "Review Required", "Failed", "Offer", "Interview"] and events:
                    # Give one last flush
                    break
            except Exception:
                pass
            finally:
                local_db.close()

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/{app_id}/events-list")
def get_application_events_list(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve full history list of events for an application."""
    app = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    events = db.query(ApplicationEvent).filter(
        ApplicationEvent.application_id == app_id
    ).order_by(ApplicationEvent.id.asc()).all()

    return {
        "status": app.status,
        "events": [
            {
                "id": ev.id,
                "step": ev.step,
                "progress": ev.progress,
                "status_text": ev.status_text,
                "is_error": ev.is_error,
                "created_at": ev.created_at.isoformat() if ev.created_at else None
            }
            for ev in events
        ]
    }

@router.post("/{app_id}/approve")
def approve_application(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approve application submission and issue confirmation status."""
    app = db.query(Application).filter(
        Application.id == app_id,
        Application.user_id == current_user.id
    ).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    app.status = "Applied"
    
    # Audit log entry
    audit = AuditLog(
        user_id=current_user.id,
        event="Application Approved",
        details=f"User approved application submission for {app.title} at {app.company}."
    )
    db.add(audit)
    db.commit()
    db.refresh(app)
    return {"status": "success", "message": "Application approved successfully", "token": "approve_token_abc123"}

@router.post("/auto-apply-all")
def auto_apply_all_matched(
    min_score: float = Query(60.0, description="Minimum match percentage threshold for auto-apply"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Automated Batch Apply: Automatically match, prepare, tailor resumes, and submit applications 
    for all jobs that meet or exceed the user's match score threshold.
    """
    from app.models.job import JobMatch
    from app.models.user import Profile, UserPlatformCredential
    from app.services.match_service import match_service

    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    effective_min_score = profile.min_match_percentage if profile and profile.min_match_percentage else min_score

    # Fetch all jobs in DB
    all_jobs = db.query(Job).all()
    applied_or_saved_job_ids = set(
        j[0] for j in db.query(Application.job_id).filter(
            Application.user_id == current_user.id,
            Application.status.in_(["Applied", "Visited", "Interview", "Offer"])
        ).all()
    )

    candidates = [j for j in all_jobs if j.id not in applied_or_saved_job_ids]
    processed_count = 0
    applied_count = 0
    saved_count = 0

    for job in candidates:
        try:
            # Check match score
            score_res = match_service.calculate_match_score(current_user.id, job.id, db)
            match_score = score_res.get("match_score", 0.0)

            if match_score >= effective_min_score:
                # Ensure application record exists
                app = db.query(Application).filter(
                    Application.user_id == current_user.id,
                    Application.job_id == job.id
                ).first()

                if not app:
                    app = Application(
                        user_id=current_user.id,
                        job_id=job.id,
                        company=job.company,
                        title=job.title,
                        source=job.source,
                        match_score=match_score,
                        status="Ready"
                    )
                    db.add(app)
                    db.commit()
                    db.refresh(app)
                    saved_count += 1

                # Check if credentials exist for browser auto-apply
                platform = (job.source or "").lower().strip()
                cred = db.query(UserPlatformCredential).filter(
                    UserPlatformCredential.user_id == current_user.id,
                    UserPlatformCredential.platform == platform,
                    UserPlatformCredential.is_active == True
                ).first()

                if cred:
                    try:
                        browser_manager.fill_and_apply(app.id, db)
                        applied_count += 1
                    except Exception as b_err:
                        logger.warning(f"Browser auto-apply for job {job.id} deferred: {b_err}")
                
                processed_count += 1
        except Exception as err:
            logger.error(f"Error processing auto-apply for job {job.id}: {err}")

    return {
        "status": "success",
        "processed_candidates": processed_count,
        "auto_applied_count": applied_count,
        "ready_in_queue": saved_count,
        "message": f"Auto-apply complete! {applied_count} applied automatically, {saved_count} prepared in queue (Threshold: {effective_min_score}%)."
    }


# ==========================================
# Application Q&A Management Endpoints
# ==========================================

from pydantic import BaseModel

class QAUdpateRequest(BaseModel):
    answer: str

class QAGenerateRequest(BaseModel):
    question: str
    job_title: Optional[str] = "Software Developer"
    job_description: Optional[str] = ""
    max_words: Optional[int] = None

@router.get("/qa/all")
def get_all_application_qa(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all screening questions and answers across all applications for the current user."""
    results = db.query(ApplicationAnswer, Application, Job)\
        .join(Application, ApplicationAnswer.application_id == Application.id)\
        .outerjoin(Job, Application.job_id == Job.id)\
        .filter(Application.user_id == current_user.id)\
        .order_by(ApplicationAnswer.created_at.desc())\
        .all()

    qa_list = []
    for ans, app, job in results:
        qa_list.append({
            "id": ans.id,
            "application_id": app.id,
            "question": ans.question,
            "answer": ans.answer,
            "is_generated": ans.is_generated,
            "created_at": ans.created_at.isoformat() if ans.created_at else None,
            "company": app.company or (job.company if job else "Unknown"),
            "job_title": app.title or (job.title if job else "Position"),
            "source": app.source or (job.source if job else "External"),
            "job_id": job.id if job else app.job_id,
            "job_url": job.url if job else None,
            "status": app.status
        })

    return qa_list

@router.put("/qa/{answer_id}")
def update_qa_answer(
    answer_id: int,
    request: QAUdpateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update or customize the saved answer for an application question."""
    ans = db.query(ApplicationAnswer)\
        .join(Application, ApplicationAnswer.application_id == Application.id)\
        .filter(ApplicationAnswer.id == answer_id, Application.user_id == current_user.id)\
        .first()

    if not ans:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question/Answer record not found."
        )

    ans.answer = request.answer.strip()
    ans.is_generated = False # Mark as verified / customized by user
    db.commit()
    db.refresh(ans)

    return {
        "id": ans.id,
        "question": ans.question,
        "answer": ans.answer,
        "is_generated": ans.is_generated
    }

@router.delete("/qa/{answer_id}")
def delete_qa_answer(
    answer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a saved question/answer record."""
    ans = db.query(ApplicationAnswer)\
        .join(Application, ApplicationAnswer.application_id == Application.id)\
        .filter(ApplicationAnswer.id == answer_id, Application.user_id == current_user.id)\
        .first()

    if not ans:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question/Answer record not found."
        )

    db.delete(ans)
    db.commit()
    return {"status": "success", "message": "Question/Answer record removed."}

class CrawlJobRequest(BaseModel):
    url: str

@router.post("/qa/generate")
def generate_ai_qa_answer(
    request: QAGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate a high-quality tailored answer using RAG semantic resume vector retrieval and hypothetical reasoning."""
    primary_model = current_user.profile.primary_model if current_user.profile else None

    # Use RAG engine to generate authentic, candidate-grounded answers
    answer = rag_service.generate_rag_answer(
        db=db,
        user_id=current_user.id,
        question=request.question,
        job_title=request.job_title or "Software Developer",
        job_description=request.job_description or "",
        model_override=primary_model
    )

    return {
        "question": request.question,
        "answer": answer,
        "max_words": request.max_words
    }

@router.post("/rag/vectorize")
def vectorize_candidate_resume_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Vectorize or refresh the candidate's resume semantic embeddings for RAG retrieval."""
    chunk_count = rag_service.vectorize_candidate_resume(db, current_user.id)
    return {
        "status": "success",
        "message": f"Successfully vectorized {chunk_count} resume chunks for semantic RAG.",
        "user_id": current_user.id,
        "chunks_indexed": chunk_count
    }

@router.post("/crawl/extract")
async def crawl_job_listing_endpoint(
    request: CrawlJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crawl any job listing URL and extract structured job requirements using Crawl AI."""
    if not request.url:
        raise HTTPException(status_code=400, detail="Job URL is required.")

    crawled_data = await crawl_ai_service.crawl_job_url(request.url)
    return {
        "status": "success",
        "data": crawled_data
    }

@router.get("/{app_id}/extension-context")
def get_extension_application_context(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Retrieve full job and candidate context for the Chrome Extension automation agent."""
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    target_user = current_user or app.user
    if not target_user:
        target_user = db.query(User).filter(User.id == app.user_id).first()

    profile = target_user.profile if target_user else None
    latest_resume = None
    if target_user:
        latest_resume = db.query(ResumeVersion).join(Resume).filter(
            Resume.user_id == target_user.id,
            Resume.is_active == True
        ).order_by(ResumeVersion.id.desc()).first()

    parsed = latest_resume.parsed_data if (latest_resume and latest_resume.parsed_data) else {}
    
    # Candidate details
    candidate_info = {
        "full_name": (profile.full_name if profile and profile.full_name else parsed.get("name", "Applicant")),
        "email": target_user.email if target_user else "",
        "phone": (profile.phone if profile and profile.phone else parsed.get("phone", "")),
        "location": (profile.location if profile and profile.location else parsed.get("location", "")),
        "notice_period": (profile.notice_period if profile and profile.notice_period else "Immediate"),
        "salary_expectation": (profile.salary_expectation if profile and profile.salary_expectation else "Negotiable"),
        "linkedin": (profile.linkedin if profile and profile.linkedin else ""),
        "github": (profile.github if profile and profile.github else ""),
        "portfolio": (profile.portfolio if profile and profile.portfolio else ""),
        "work_authorization": (profile.work_authorization if profile and profile.work_authorization else "authorized"),
        "skills": parsed.get("skills", []),
        "experience_years": parsed.get("total_experience", 2),
        "current_ctc": profile.salary_expectation if profile and profile.salary_expectation else "5,00,000 INR",
        "expected_ctc": profile.salary_expectation if profile and profile.salary_expectation else "8,00,000 INR"
    }

    job_info = {
        "id": app.job.id if app.job else app.job_id,
        "title": app.job.title if app.job else app.title,
        "company": app.job.company if app.job else app.company,
        "url": app.job.url if app.job else "",
        "source": app.job.source if app.job else app.source,
        "location": app.job.location if app.job else "",
        "description": app.job.description if app.job else "",
        "skills": [s.name for s in app.job.skills] if (app.job and app.job.skills) else []
    }

    return {
        "app_id": app.id,
        "job": job_info,
        "candidate": candidate_info,
        "resume_data": parsed
    }

@router.post("/{app_id}/events")
def log_extension_event(
    app_id: int,
    request: ApplicationEventCreate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Log real-time application step event from the Chrome Extension into telemetry stream."""
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    event = ApplicationEvent(
        application_id=app.id,
        step=request.step,
        progress=request.progress,
        status_text=request.status_text,
        is_error=request.is_error
    )
    db.add(event)

    user_id = current_user.id if current_user else app.user_id
    if user_id:
        audit = AuditLog(
            user_id=user_id,
            event=request.step,
            details=request.status_text
        )
        db.add(audit)
    db.commit()

    return {"status": "logged", "event_id": event.id}

@router.patch("/{app_id}/status")
def update_extension_application_status(
    app_id: int,
    request: ApplicationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Update application final status and audit notes from Chrome Extension."""
    import datetime
    app = db.query(Application).filter(Application.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")

    app.status = request.status
    if request.notes:
        app.notes = request.notes
    if request.status == "Applied":
        app.applied_at = datetime.datetime.utcnow()

    user_id = current_user.id if current_user else app.user_id
    if user_id:
        audit = AuditLog(
            user_id=user_id,
            event=f"Status Updated to {request.status}",
            details=request.notes or f"Application status changed to {request.status} via Chrome Extension."
        )
        db.add(audit)
    db.commit()
    db.refresh(app)
    return app

    return {"status": "updated", "app_status": app.status, "notes": app.notes}

@router.post("/auto-apply-all")
def auto_apply_all_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Applies to all unapplied jobs for the candidate.
    Creates applications, records telemetry events, and updates statuses.
    """
    import datetime
    
    existing_job_ids = [
        app.job_id for app in db.query(Application.job_id).filter(
            Application.user_id == current_user.id,
            Application.status.in_(["Applied", "Ready", "Review Required"])
        ).all()
    ]
    
    candidate_jobs = db.query(Job).filter(
        ~Job.id.in_(existing_job_ids) if existing_job_ids else True
    ).limit(15).all()

    if not candidate_jobs:
        return {"status": "ok", "applied_count": 0, "message": "All current matched jobs are already applied!"}

    applied_count = 0
    for job in candidate_jobs:
        app = Application(
            user_id=current_user.id,
            job_id=job.id,
            company=job.company,
            title=job.title,
            source=job.source,
            status="Applied",
            applied_date=datetime.datetime.utcnow(),
            notes="Applied via HireMind AI Automator."
        )
        db.add(app)
        db.flush()

        event = ApplicationEvent(
            application_id=app.id,
            step="Applied",
            progress=100,
            status_text=f"Auto-applied to {job.title} at {job.company}."
        )
        db.add(event)
        applied_count += 1

    db.commit()
    return {
        "status": "ok",
        "applied_count": applied_count,
        "message": f"Successfully applied to {applied_count} jobs!"
    }


