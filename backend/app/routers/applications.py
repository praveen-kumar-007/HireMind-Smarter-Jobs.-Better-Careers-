from typing import List, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.models.resume import Resume, ResumeVersion
from app.models.application import Application, ApplicationAnswer
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

    # 4. Auto-generate standard application screening answers if resume is uploaded
    resume = db.query(Resume).filter(Resume.user_id == current_user.id, Resume.is_active == True).first()
    if resume:
        latest_version = db.query(ResumeVersion).filter(ResumeVersion.resume_id == resume.id).order_by(ResumeVersion.version.desc()).first()
        if latest_version and latest_version.parsed_data:
            # Generate common question responses
            common_questions = [
                "Tell us about yourself.",
                "Why should we hire you for this role?",
                "Why do you want this role?"
            ]
            primary_model = current_user.profile.primary_model or "qwen3:8b"
            temp = current_user.profile.ai_temperature or 0.7
            timeout = current_user.profile.ai_timeout or 120
            for question in common_questions:
                answer = ai_service.generate_answers(
                    resume_data=latest_version.parsed_data,
                    job_title=job.title,
                    job_description=job.description or "",
                    question=question,
                    model_override=primary_model,
                    temperature=temp,
                    timeout_override=timeout
                )
                if "requires_user_input" in answer:
                    app.status = "Review Required"
                db_answer = ApplicationAnswer(
                    application_id=app.id,
                    question=question,
                    answer=answer,
                    is_generated=True
                )
                db.add(db_answer)
            db.commit()
            db.refresh(app)

    return app

@router.get("", response_model=List[ApplicationResponse])
def get_applications(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Application).filter(Application.user_id == current_user.id)
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
    app = db.query(Application).filter(
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
    db.delete(app)
    db.commit()
    return None

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
