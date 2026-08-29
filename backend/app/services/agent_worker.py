import time
import logging
import threading
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.user import User, Profile, UserPlatformCredential
from app.models.job import Job
from app.models.application import Application
from app.services.job_service import job_discovery_service
from app.services.match_service import match_service
from app.services.automation_service import browser_manager

logger = logging.getLogger(__name__)

def run_agent_auto_apply():
    """Core AI agent auto-apply sequence."""
    logger.info("Starting background AI auto-apply cycle...")
    db: Session = SessionLocal()
    try:
        # 1. Fetch active users
        users = db.query(User).filter(User.is_active == True).all()
        for user in users:
            profile = db.query(Profile).filter(Profile.user_id == user.id).first()
            if not profile:
                continue

            target_roles = profile.target_roles or ["Python Developer"]
            preferred_locations = profile.preferred_locations or ["Remote"]
            min_match = profile.min_match_percentage or 60.0

            # 2. Discover live jobs for target roles
            new_jobs = []
            for role in target_roles:
                for loc in preferred_locations:
                    try:
                        jobs = job_discovery_service.discover_and_save_jobs(db, query=role, location=loc, user_id=user.id, save_to_db=True)
                        new_jobs.extend(jobs)
                    except Exception as ex:
                        logger.error(f"Error crawling jobs for user {user.id} - {role}: {ex}")

            logger.info(f"Discovered {len(new_jobs)} potential jobs in this cycle.")

            # 3. Filter jobs matching resume via FAISS / local LLM
            for job in new_jobs:
                try:
                    # Calculate match score
                    score_res = match_service.calculate_match_score(user.id, job.id, db)
                    score = score_res.get("match_score", 0)
                    
                    if score >= min_match:
                        logger.info(f"Job Match found: {job.title} at {job.company} ({score}%). Saving application...")
                        
                        # Create Application record
                        app = db.query(Application).filter(
                            Application.user_id == user.id,
                            Application.job_id == job.id
                        ).first()

                        if not app:
                            app = Application(
                                user_id=user.id,
                                job_id=job.id,
                                status="Saved"
                            )
                            db.add(app)
                            db.commit()
                            db.refresh(app)

                        # Check if credentials exist for the job platform
                        platform = job.source.lower().strip()
                        cred = db.query(UserPlatformCredential).filter(
                            UserPlatformCredential.user_id == user.id,
                            UserPlatformCredential.platform == platform,
                            UserPlatformCredential.is_active == True
                        ).first()

                        if cred:
                            logger.info(f"Credentials found for {platform}. Executing auto-apply agent...")
                            browser_manager.fill_and_apply(app.id, db)
                        else:
                            logger.info(f"No active credentials stored for platform {platform}. Application saved in dashboard.")

                except Exception as ex:
                    logger.error(f"Error executing match-apply loop for job {job.id}: {ex}")

    except Exception as e:
        logger.error(f"Background auto-apply worker failed: {e}")
    finally:
        db.close()

def worker_loop():
    """Worker daemon execution loop running every 4 hours."""
    # Sleep 20 seconds on initial startup to allow server boot to finish cleanly
    time.sleep(20)
    
    while True:
        try:
            run_agent_auto_apply()
        except Exception as e:
            logger.error(f"Error in auto-apply loop: {e}")
        
        # Sleep for 4 hours (14400 seconds)
        time.sleep(14400)

def start_agent_worker():
    """Starts the background agent execution worker in a daemon thread."""
    logger.info("Initializing background AI application agent thread...")
    t = threading.Thread(target=worker_loop, daemon=True, name="AI_Agent_Worker")
    t.start()
