import os
import sys

# Add app directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db.session import SessionLocal
from app.models.application import Application
from app.services.automation_service import browser_manager

print("Running local auto-fill diagnostic...")

db = SessionLocal()
try:
    # Find latest application
    app = db.query(Application).order_by(Application.id.desc()).first()
    if not app:
        print("[FAIL] No applications found in database.")
        sys.exit(1)
        
    print(f"Latest Application Details:")
    print(f" - ID: {app.id}")
    print(f" - Job Title: {app.job.title}")
    print(f" - Company: {app.job.company}")
    print(f" - Source: {app.job.source}")
    print(f" - Status: {app.status}")
    print(f" - Notes: {app.notes}")
    
    print("\nTriggering auto_fill in headed mode...")
    result = browser_manager.fill_and_apply(app.id, db)
    print("\n[SUCCESS] execution completed!")
    print(f"Result: {result}")
finally:
    db.close()
