import sys
import os

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.db.session import SessionLocal
from app.services.automation_service import browser_manager

def main():
    if len(sys.argv) < 2:
        print("Usage: python -m app.services.automation_runner <application_id>", flush=True)
        sys.exit(1)
        
    app_id = int(sys.argv[1])
    print(f"[Automation Runner] Starting live headed browser agent for application_id={app_id}", flush=True)
    
    db = SessionLocal()
    try:
        result = browser_manager.fill_and_apply(app_id, db)
        print(f"[Automation Runner] Agent finished with result: {result}", flush=True)
    except Exception as e:
        print(f"[Automation Runner] Error: {e}", flush=True)
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
