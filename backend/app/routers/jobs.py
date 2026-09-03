from typing import List, Optional
import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status

logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.models.job import Job
from app.schemas.job import JobResponse
from app.routers.deps import get_current_user
from app.services.job_service import job_discovery_service

router = APIRouter(prefix="/jobs", tags=["jobs"])

from collections import defaultdict
from sqlalchemy import or_, and_, desc
from sqlalchemy.orm import joinedload
from app.models.resume import Resume, ResumeVersion
from app.models.job import JobSkill

@router.get("", response_model=List[JobResponse])
def get_jobs(
    search: Optional[str] = Query(None, description="Search by title, company or skills"),
    location: Optional[str] = Query(None, description="Filter by location"),
    source: Optional[str] = Query(None, description="Filter by source board (e.g. Naukri)"),
    match_profile: bool = Query(False, description="Prioritize jobs matching user profile and resume keywords"),
    trigger_scan: bool = Query(False, description="If true, trigger live job crawler before returning"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import binascii
    import datetime
    from app.models.application import Application
    ALLOWED_SOURCES = ["Naukri", "Company Website", "LinkedIn", "Indeed", "Glassdoor", "WorkIndia", "Direct Careers"]

    # 1. Trigger live crawler scan if requested
    if trigger_scan:
        profile = current_user.profile
        user_target_roles = (profile.target_roles or []) if profile else []
        
        if search:
            clean_s = search.strip().lower()
            if "urgent" in clean_s or "mass" in clean_s or "fresher" in clean_s:
                scan_keywords = [f"IT software developer {search}", f"software engineer {search}"]
            else:
                scan_keywords = [search]
        else:
            scan_keywords = user_target_roles if user_target_roles else ["Software Developer", "Python Developer", "Full Stack Developer"]
            
        # Default to India if the user's profile location is Dhanbad and no location is selected, 
        # as the user wants popular IT hubs/Worldwide instead of Dhanbad.
        loc = location
        if not loc or loc.strip() == "":
            if profile and profile.location and "dhanbad" not in profile.location.lower():
                loc = profile.location
            else:
                loc = "India"
        
        # Parallelize keyword discovery for maximum execution speed
        transient_jobs = []
        for kw in scan_keywords[:2]:
            try:
                res = job_discovery_service.discover_and_save_jobs(
                    db, query=kw, location=loc, user_id=current_user.id, save_to_db=False
                )
                if res:
                    transient_jobs.extend(res)
            except Exception as e:
                logger.error(f"Discovery error for '{kw}': {e}")
                
        # Deduplicate transient scanned jobs
        seen_keys = set()
        unique_transient = []
        for job in transient_jobs:
            title = job.get("title") or ""
            company = job.get("company") or ""
            url = job.get("url") or ""
            
            clean_title = title.strip().lower()
            clean_company = company.strip().lower()
            clean_url = url.split("?")[0].rstrip("/").lower()
            
            comp_title_key = f"{clean_company}::{clean_title}"
            if comp_title_key in seen_keys or (clean_url and clean_url in seen_keys):
                continue
            seen_keys.add(comp_title_key)
            if clean_url:
                seen_keys.add(clean_url)
            unique_transient.append(job)

        # Batch-save unique discovered jobs in the main thread (thread-safe and fast)
        db_jobs = []
        for t_job in unique_transient:
            clean_comp = t_job["company"].strip()
            clean_title = t_job["title"].strip()
            clean_url_base = (t_job["url"] or "").split("?")[0].rstrip("/")

            existing = db.query(Job).filter(
                (Job.job_id == t_job["job_id"]) |
                (Job.url == t_job["url"]) |
                (Job.url.ilike(f"{clean_url_base}%")) |
                ((Job.company.ilike(clean_comp)) & (Job.title.ilike(clean_title)))
            ).first()

            if existing:
                db_jobs.append(existing)
            else:
                try:
                    new_job = Job(
                        job_id=t_job["job_id"],
                        title=t_job["title"],
                        company=t_job["company"],
                        location=t_job.get("location"),
                        salary=t_job.get("salary"),
                        experience=t_job.get("experience"),
                        description=t_job.get("description"),
                        url=t_job.get("url"),
                        source=t_job["source"],
                        posted_date=t_job.get("posted_date") or datetime.datetime.utcnow()
                    )
                    db.add(new_job)
                    db.flush()

                    for sk_dict in t_job.get("skills", []):
                        sk_name = sk_dict.get("name") if isinstance(sk_dict, dict) else sk_dict
                        if sk_name:
                            db.add(JobSkill(job_id=new_job.id, name=sk_name))
                    
                    db_jobs.append(new_job)
                except Exception as save_err:
                    logger.error(f"Error saving job {t_job['job_id']}: {save_err}")
        
        db.commit()

        # Query all active non-dismissed jobs from DB to return complete list
        dismissed_ids = [a.job_id for a in db.query(Application).filter(Application.user_id == current_user.id, Application.status == "Dismissed").all() if a.job_id]
        active_db_q = db.query(Job).options(joinedload(Job.skills), joinedload(Job.job_matches))
        if dismissed_ids:
            active_db_q = active_db_q.filter(~Job.id.in_(dismissed_ids))
        all_active = active_db_q.order_by(Job.created_at.desc()).limit(150).all()
        return all_active if all_active else db_jobs[:100]

    # 2. If trigger_scan is False and no jobs exist in DB, return transient fallback jobs
    job_count = db.query(Job).count()
    if job_count == 0:
        transient_fallbacks = []
        for prov_key, adapter in job_discovery_service.adapters.items():
            for fb in adapter.get_fallback_jobs("Software Engineer", "Bangalore, India", limit=12):
                transient_id = binascii.crc32(fb["job_id"].encode('utf-8')) & 0x7fffffff
                transient_fallbacks.append({
                    "id": transient_id,
                    "job_id": fb["job_id"],
                    "title": fb["title"],
                    "company": fb["company"],
                    "location": fb["location"],
                    "salary": fb["salary"],
                    "experience": fb["experience"],
                    "description": fb["description"],
                    "url": fb["url"],
                    "source": fb["source"],
                    "posted_date": fb["posted_date"],
                    "created_at": datetime.datetime.utcnow(),
                    "skills": [{"id": idx, "name": sk} for idx, sk in enumerate(fb.get("skills", []))]
                })
        return transient_fallbacks[:100]

    # 3. Build Query with eager loading for maximum speed (N+1 query elimination)
    # Only exclude jobs marked as Dismissed.
    # Jobs that are Applied (Mail Pending), Visited, Saved, or Manual Intervention stay on the board with professional status badges and revert options.
    dismissed_apps = db.query(Application).filter(
        Application.user_id == current_user.id,
        Application.status == "Dismissed"
    ).all()

    excluded_job_ids = set()
    for app in dismissed_apps:
        if app.job_id:
            excluded_job_ids.add(app.job_id)

    query = db.query(Job).options(joinedload(Job.skills), joinedload(Job.job_matches))
    
    if excluded_job_ids:
        query = query.filter(~Job.id.in_(list(excluded_job_ids)))
    
    profile = current_user.profile
    if profile:
        for exc_co in (profile.excluded_companies or []):
            if exc_co and exc_co.strip():
                query = query.filter(~Job.company.ilike(f"%{exc_co.strip()}%"))
        for exc_ti in (profile.excluded_job_titles or []):
            if exc_ti and exc_ti.strip():
                query = query.filter(~Job.title.ilike(f"%{exc_ti.strip()}%"))

    NON_IT_TERMS = [
        "bpo", "voice process", "non voice", "customer care", "customer support", "telecaller",
        "telesales", "xray", "x-ray", "dialysis", "technician", "nurse", "doctor", "counsellor",
        "counselor", "construction", "carpenter", "driver", "delivery", "ca finalist", "ca final",
        "chartered accountant", "store in-charge", "storekeeper", "recruiter", "talent acquisition",
        "hr executive", "screener", "ardm", "rdm", "insurance", "banking process", "language specialist",
        "maintenance operative", "account manager"
    ]
    for term in NON_IT_TERMS:
        query = query.filter(~Job.title.ilike(f"%{term}%"))

    if source and source.strip():
        query = query.filter(Job.source.ilike(source.strip()))
    else:
        query = query.filter(Job.source.in_(ALLOWED_SOURCES))

    if search and search.strip():
        search_filter = f"%{search.strip()}%"
        query = query.filter(
            (Job.title.ilike(search_filter)) |
            (Job.company.ilike(search_filter)) |
            (Job.description.ilike(search_filter))
        )

    if location and location.strip():
        query = query.filter(Job.location.ilike(f"%{location.strip()}%"))

    query = query.order_by(Job.created_at.desc())
    all_jobs = query.limit(200).all()

    if match_profile and profile:
        user_target_roles = (profile.target_roles or []) if profile else []
        resume_skills = []
        active_resume = db.query(Resume).filter(Resume.user_id == current_user.id, Resume.is_active == True).first()
        if active_resume:
            latest_ver = db.query(ResumeVersion).filter(ResumeVersion.resume_id == active_resume.id).order_by(ResumeVersion.version.desc()).first()
            if latest_ver and latest_ver.parsed_data:
                extracted = latest_ver.parsed_data.get("skills", [])
                if isinstance(extracted, list):
                    resume_skills = [str(s).lower().strip() for s in extracted]
                elif isinstance(extracted, str):
                    resume_skills = [s.lower().strip() for s in extracted.split(",")]

        match_terms = [r.lower().strip() for r in user_target_roles] + resume_skills[:10]
        
        def match_score_key(job: Job) -> int:
            score = 0
            title_lower = (job.title or "").lower()
            desc_lower = (job.description or "").lower()
            skill_names = [s.name.lower() for s in (job.skills or [])]
            for term in match_terms:
                if term in title_lower:
                    score += 10
                elif any(term in s for s in skill_names):
                    score += 5
                elif term in desc_lower:
                    score += 2
            return score

        all_jobs.sort(key=match_score_key, reverse=True)

    seen_keys = set()
    unique_jobs = []
    import re
    for job in all_jobs:
        clean_title = (job.title or "").strip().lower()
        clean_company = (job.company or "").strip().lower()
        clean_url = (job.url or "").split("?")[0].rstrip("/").lower()
        
        # Completely exclude email sent or dismissed jobs
        if job.id in excluded_job_ids:
            continue

        comp_title_key = f"{clean_company}::{clean_title}"
        if comp_title_key in seen_keys or (clean_url and clean_url in seen_keys):
            continue
        
        seen_keys.add(comp_title_key)
        if clean_url:
            seen_keys.add(clean_url)
        unique_jobs.append(job)

    if not source:
        by_source = defaultdict(list)
        for job in unique_jobs:
            src_key = (job.source or "Other").strip().lower()
            by_source[src_key].append(job)
        
        balanced_jobs = []
        max_source_count = max([len(v) for v in by_source.values()]) if by_source else 0
        for idx in range(max_source_count):
            for src_key in list(by_source.keys()):
                if idx < len(by_source[src_key]):
                    balanced_jobs.append(by_source[src_key][idx])
        return balanced_jobs[:100]
    else:
        return unique_jobs[:100]


from pydantic import BaseModel

class JobEnsureRequest(BaseModel):
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
    skills: Optional[List[str]] = []


@router.post("/ensure", response_model=JobResponse)
def ensure_job(
    request: JobEnsureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    clean_comp = request.company.strip()
    clean_title = request.title.strip()
    clean_url_base = (request.url or "").split("?")[0].rstrip("/")
    
    # Check existing in DB
    existing = db.query(Job).filter(
        (Job.job_id == request.job_id) |
        (Job.url == request.url) |
        (Job.url.ilike(f"{clean_url_base}%")) |
        ((Job.company.ilike(clean_comp)) & (Job.title.ilike(clean_title)))
    ).first()
    
    if existing:
        return existing
        
    # Create the Job
    job = Job(
        job_id=request.job_id,
        title=request.title,
        company=request.company,
        location=request.location,
        salary=request.salary,
        experience=request.experience,
        description=request.description,
        url=request.url,
        source=request.source,
        posted_date=request.posted_date or datetime.datetime.utcnow()
    )
    db.add(job)
    db.flush()
    
    # Add JobSkills
    for skill_name in (request.skills or []):
        db.add(JobSkill(job_id=job.id, name=skill_name))
        
    db.commit()
    db.refresh(job)
    return job

@router.get("/{job_id}", response_model=JobResponse)
def get_job_by_id(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job listing not found."
        )
    return job


@router.delete("/{job_id}")
def delete_expired_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Permanently delete an expired/invalid job from the database, along with any related applications."""
    from app.models.application import Application, ApplicationAnswer, ApplicationEvent
    
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return {"status": "not_found", "message": f"Job #{job_id} not found in database."}
    
    job_title = job.title
    job_company = job.company
    
    # Delete related applications, answers, and events
    related_apps = db.query(Application).filter(Application.job_id == job_id).all()
    for app in related_apps:
        db.query(ApplicationAnswer).filter(ApplicationAnswer.application_id == app.id).delete()
        db.query(ApplicationEvent).filter(ApplicationEvent.application_id == app.id).delete()
        db.delete(app)
    
    # Delete the job itself
    db.delete(job)
    db.commit()
    
    logger.info(f"[Expired] Permanently deleted job #{job_id}: '{job_title}' at {job_company}")
    return {
        "status": "deleted",
        "message": f"Permanently removed expired job '{job_title}' at {job_company} and {len(related_apps)} related application(s)."
    }

from pydantic import BaseModel

class BulkDismissRequest(BaseModel):
    job_ids: Optional[List[int]] = None

@router.post("/{job_id}/dismiss")
def dismiss_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a job listing as dismissed so it is cleared/removed from the job board."""
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job listing not found."
        )
    
    from app.models.application import Application
    app = db.query(Application).filter(
        Application.user_id == current_user.id,
        Application.job_id == job_id
    ).first()

    if not app:
        app = Application(
            user_id=current_user.id,
            job_id=job.id,
            company=job.company,
            title=job.title,
            source=job.source,
            match_score=0.0,
            status="Dismissed"
        )
        db.add(app)
    else:
        app.status = "Dismissed"
        
    db.commit()
    return {"status": "success", "message": f"Job '{job.title}' cleared."}

@router.post("/dismiss-bulk")
def dismiss_bulk_jobs(
    req: Optional[BulkDismissRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Dismiss/clear multiple jobs at once from the job board."""
    from app.models.application import Application
    
    if req and req.job_ids:
        jobs_to_dismiss = db.query(Job).filter(Job.id.in_(req.job_ids)).all()
    else:
        # Dismiss all currently untracked jobs
        existing_app_job_ids = [j[0] for j in db.query(Application.job_id).filter(Application.user_id == current_user.id).all()]
        query = db.query(Job)
        if existing_app_job_ids:
            query = query.filter(~Job.id.in_(existing_app_job_ids))
        jobs_to_dismiss = query.all()

    for job in jobs_to_dismiss:
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
                match_score=0.0,
                status="Dismissed"
            )
            db.add(app)
        else:
            app.status = "Dismissed"

    db.commit()
    return {"status": "success", "count": len(jobs_to_dismiss), "message": f"{len(jobs_to_dismiss)} jobs cleared."}

