import os
import sys
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.job import Job, JobSkill
from app.models.application import Application
from app.models.user import User

db = SessionLocal()

user = db.query(User).first()
if not user:
    print("No user found!")
    sys.exit(1)

print(f"Syncing real jobs for user: {user.email}")

# 1. Remove all dummy / fake jobs (URLs containing fake numeric IDs like 050926... or fallback)
dummy_jobs = db.query(Job).filter(
    (Job.url.like("%050926%")) | 
    (Job.job_id.like("fallback%")) |
    (Job.job_id.like("dummy%"))
).all()

dummy_ids = [j.id for j in dummy_jobs]
print(f"Found {len(dummy_ids)} dummy/fake jobs to clean up.")

if dummy_ids:
    # Remove associated applications that were on dummy jobs
    db.query(Application).filter(Application.job_id.in_(dummy_ids)).delete(synchronize_session=False)
    db.query(JobSkill).filter(JobSkill.job_id.in_(dummy_ids)).delete(synchronize_session=False)
    db.query(Job).filter(Job.id.in_(dummy_ids)).delete(synchronize_session=False)
    db.commit()
    print("Successfully deleted all dummy jobs!")

print(f"Remaining active jobs in DB: {db.query(Job).count()}")
db.close()
