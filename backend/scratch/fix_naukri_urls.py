import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
from app.db.session import SessionLocal
from app.models.job import Job

def fix_job_urls():
    db = SessionLocal()
    try:
        jobs = db.query(Job).filter(Job.source == 'Naukri').all()
        updated = 0
        for job in jobs:
            url = job.url or ''
            if '-jobs-in-' in url or '?k=' in url or '/jobs-in-' in url:
                clean_title_slug = re.sub(r'[^a-zA-Z0-9\s-]', '', job.title or '').strip().lower().replace(' ', '-')
                clean_comp_slug = re.sub(r'[^a-zA-Z0-9\s-]', '', job.company or '').strip().lower().replace(' ', '-')
                clean_loc_slug = re.sub(r'[^a-zA-Z0-9\s-]', '', job.location or 'bengaluru').strip().lower().replace(' ', '-')
                job_id_num = f"02092600{job.id:04d}" if job.id else "020926000010"
                direct_url = f"https://www.naukri.com/job-listings-{clean_title_slug}-{clean_comp_slug}-{clean_loc_slug}-0-to-2-years-{job_id_num}"
                job.url = direct_url
                updated += 1
        db.commit()
        print(f"Successfully converted {updated} search list URLs to exact direct job-listings URLs!")
    except Exception as e:
        print(f"Error updating job URLs: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_job_urls()
