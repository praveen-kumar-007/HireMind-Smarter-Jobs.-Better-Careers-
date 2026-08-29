import logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

from app.db.session import SessionLocal
from app.models.user import User, Profile, UserPlatformCredential
from app.services.job_service import job_discovery_service
from app.services.match_service import match_service
from app.services.automation_service import browser_manager
from app.models.application import Application

db = SessionLocal()
try:
    user = db.query(User).filter(User.is_active == True).first()
    if not user:
        print("No active user found.")
        exit(0)
        
    print(f"Running auto-apply cycle for user: {user.email}")
    profile = user.profile
    if not profile:
        print("No profile found.")
        exit(0)
        
    # Search roles on Naukri primary
    role = profile.target_roles[0] if profile.target_roles else "Machine Learning Developer"
    loc = "India"
    
    print(f"Discovering jobs on Naukri for '{role}' in '{loc}'...")
    jobs = job_discovery_service.discover_and_save_jobs(db, query=role, location=loc, providers=["naukri"], user_id=user.id, save_to_db=True)
    print(f"Discovered {len(jobs)} jobs.")
    
    for job in jobs:
        # Get job skills
        job_skills = [s.name for s in job.skills]
        if not job_skills:
            job_skills = [role]
            
        score_res = match_service.calculate_match_score(
            resume_text="Name: Praveen Kumar. B.Tech Computer Science from Swami Vivekananda University. Skills: Python, Scikit-learn, TensorFlow, React JS, Node JS, HTML, CSS, JavaScript, SQL.",
            job_desc=job.description or "",
            resume_skills=["Python", "Scikit-learn", "TensorFlow", "React JS", "Node JS", "HTML", "CSS", "JavaScript", "SQL"],
            job_skills=job_skills,
            resume_location=profile.location or "Dhanbad, India",
            job_location=job.location or "",
            resume_exp_years=0.5,
            job_exp_desc=job.experience or ""
        )
        score = score_res.get("match_score", 0)
        print(f"Job: {job.title} at {job.company} -> Match Score: {score}%")
        
        if score >= 60.0:
            app = db.query(Application).filter(Application.user_id == user.id, Application.job_id == job.id).first()
            if not app:
                app = Application(
                    user_id=user.id,
                    job_id=job.id,
                    status="Saved",
                    company=job.company,
                    title=job.title,
                    source="Naukri"
                )
                db.add(app)
                db.commit()
                db.refresh(app)
                
            print(f"Executing browser auto-apply for: {job.title} at {job.company}...")
            result = browser_manager.fill_and_apply(app.id, db)
            print(f"Apply Result: {result}")
            
except Exception as e:
    print(f"Error running auto-apply script: {e}")
finally:
    db.close()
