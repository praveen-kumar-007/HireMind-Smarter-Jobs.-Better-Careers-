from typing import List, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session, joinedload
from app.db.session import get_db
from app.models.user import User
from app.models.job import Job, JobSkill
from app.models.resume import Resume, ResumeVersion
from app.models.application import Application, ApplicationAnswer, ApplicationEvent
from app.schemas.application import ApplicationCreate, ApplicationUpdate, ApplicationResponse, ApplicationAnswerCreate
from app.routers.deps import get_current_user
from app.services.ai_service import ai_service
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
    
    apps = db.query(Application).filter(
        Application.user_id == current_user.id,
        Application.job_id == job_id
    ).all()

    if not apps and job:
        apps = db.query(Application).filter(
            Application.user_id == current_user.id,
            func.lower(Application.company) == func.lower(job.company),
            func.lower(Application.title) == func.lower(job.title)
        ).all()

    if not apps:
        app_by_id = db.query(Application).filter(
            Application.id == job_id,
            Application.user_id == current_user.id
        ).first()
        if app_by_id:
            apps = [app_by_id]

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

    resume = db.query(Resume).filter(Resume.user_id == current_user.id, Resume.is_active == True).first()
    if not resume:
        raise HTTPException(status_code=400, detail="No resume uploaded yet.")

    latest_version = db.query(ResumeVersion).filter(ResumeVersion.resume_id == resume.id).order_by(ResumeVersion.version.desc()).first()
    if not latest_version:
        raise HTTPException(status_code=400, detail="No resume version parsed yet.")

    primary_model = current_user.profile.primary_model or "qwen3:8b"
    temp = current_user.profile.ai_temperature or 0.7
    timeout = current_user.profile.ai_timeout or 120
    answer = ai_service.generate_answers(
        resume_data=latest_version.parsed_data,
        job_title=app.job.title,
        job_description=app.job.description or "",
        question=request.question,
        model_override=primary_model,
        temperature=temp,
        timeout_override=timeout
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

@router.post("/qa/generate")
def generate_ai_qa_answer(
    request: QAGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate a high-quality tailored answer using Groq LPU / Gemini AI adhering to word count constraints."""
    # Get active resume data
    resume_data = {}
    active_resume = db.query(Resume).filter(Resume.user_id == current_user.id, Resume.is_active == True).first()
    if active_resume:
        latest_ver = db.query(ResumeVersion).filter(ResumeVersion.resume_id == active_resume.id).order_by(ResumeVersion.version.desc()).first()
        if latest_ver and latest_ver.parsed_data:
            resume_data = latest_ver.parsed_data

    # Add profile metadata
    profile = current_user.profile
    if profile:
        if profile.full_name:
            resume_data["name"] = profile.full_name
        if profile.location:
            resume_data["location"] = profile.location
        if profile.notice_period:
            resume_data["notice_period"] = profile.notice_period
        if profile.phone:
            resume_data["phone"] = profile.phone

    question_prompt = request.question
    if request.max_words and request.max_words > 0:
        question_prompt += f" Provide your answer strictly within {request.max_words} words or less in first person."

    answer = ai_service.generate_answers(
        resume_data=resume_data,
        job_title=request.job_title or "Software Developer",
        job_description=request.job_description or "",
        question=question_prompt
    )

    return {
        "question": request.question,
        "answer": answer,
        "max_words": request.max_words
    }
