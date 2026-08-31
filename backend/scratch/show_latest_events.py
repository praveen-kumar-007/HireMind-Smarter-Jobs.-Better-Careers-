import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.models.application import Application, ApplicationEvent

db = SessionLocal()
try:
    app = db.query(Application).order_by(Application.id.desc()).first()
    if app:
        print(f"Latest Application Details:")
        print(f" - ID: {app.id}")
        print(f" - Job Title: {app.job.title}")
        print(f" - Company: {app.job.company}")
        print(f" - Source: {app.job.source}")
        print(f" - Status: {app.status}")
        print(f" - Notes: {app.notes}")
        print("\nEvents List:")
        events = db.query(ApplicationEvent).filter(ApplicationEvent.application_id == app.id).order_by(ApplicationEvent.id.asc()).all()
        for e in events:
            print(f" - [{e.step_name}] {e.progress}% - {e.status_text}")
    else:
        print("No applications found.")
finally:
    db.close()
