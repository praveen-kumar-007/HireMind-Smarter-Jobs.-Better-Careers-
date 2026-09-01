"""
Fresher Job Scraper - Finds real fresher/mass-hiring jobs from Naukri API
and inserts them into the HireMind database.
"""
import json
import urllib.request
import urllib.parse
import gzip
import io
import datetime
import sys
import os
import hashlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.job import Job, JobSkill
from app.models.user import User

db = SessionLocal()
user = db.query(User).first()
if not user:
    print("ERROR: No user found!")
    sys.exit(1)

print(f"User: {user.email} (ID: {user.id})")

# Clear old jobs
existing = db.query(Job).count()
print(f"Existing jobs in DB: {existing}")

from app.models.application import Application
applied_job_ids = [a.job_id for a in db.query(Application.job_id).filter(Application.user_id == user.id).all()]

if applied_job_ids:
    old_jobs = db.query(Job).filter(~Job.id.in_(applied_job_ids)).all()
else:
    old_jobs = db.query(Job).all()

for j in old_jobs:
    db.query(JobSkill).filter(JobSkill.job_id == j.id).delete()
db.query(Job).filter(~Job.id.in_(applied_job_ids) if applied_job_ids else Job.id > 0).delete(synchronize_session='fetch')
db.commit()
print(f"Cleared {len(old_jobs)} old jobs.")

# Fresher-specific search queries
SEARCH_QUERIES = [
    ("fresher software engineer", "india"),
    ("fresher developer hiring", "bangalore"),
    ("entry level software developer", "india"),
    ("fresher python developer", "india"),
    ("fresher java developer", "india"),
    ("fresher web developer", "india"),
    ("mass hiring freshers 2025 2026", "india"),
    ("fresher IT jobs", "bangalore"),
    ("fresher frontend developer react", "india"),
    ("graduate trainee engineer", "india"),
    ("fresher backend developer", "india"),
    ("associate software engineer", "india"),
    ("fresher full stack developer", "india"),
    ("fresher data analyst", "india"),
    ("fresher QA tester", "india"),
]

all_jobs = []
seen_urls = set()

for query, location in SEARCH_QUERIES:
    clean_q = query.strip()
    clean_loc = location.strip()
    seo_key = f"{clean_q.lower().replace(' ', '-')}-jobs-in-{clean_loc.lower().replace(' ', '-')}"
    
    params = {
        'noOfResults': '20',
        'urlType': 'search_by_keyword',
        'searchType': 'adv',
        'keyword': clean_q,
        'location': clean_loc,
        'k': clean_q,
        'l': clean_loc,
        'experience': '0',
        'seoKey': seo_key,
        'src': 'jobsearchDesk'
    }
    url = f"https://www.naukri.com/jobapi/v3/search?{urllib.parse.urlencode(params)}"
    
    try:
        req = urllib.request.Request(url, headers={
            'appid': '109',
            'systemid': 'Naukri',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'clientid': 'd369c059-d656-47b2-9366-419b16174a72'
        })
        with urllib.request.urlopen(req, timeout=8) as res:
            raw = res.read()
            if res.info().get('Content-Encoding') == 'gzip':
                raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
            data = json.loads(raw.decode('utf-8'))
            job_details = data.get('jobDetails', [])
            print(f"  [{query}] => {len(job_details)} results")
            
            for item in job_details:
                title = item.get('title', '').strip()
                comp = item.get('companyName', '').strip()
                if not title or not comp:
                    continue
                
                loc = clean_loc
                sal = 'Not Specified'
                exp = 'Not Specified'
                for ph in item.get('placeholders', []):
                    t = ph.get('type')
                    lbl = ph.get('label', '')
                    if t == 'location':
                        loc = lbl
                    elif t == 'salary':
                        sal = lbl
                    elif t == 'experience':
                        exp = lbl
                
                tags_str = item.get('tagsAndSkills', '')
                skills = [s.strip() for s in tags_str.split(',') if s.strip()] if tags_str else []
                
                jd_url = item.get('jdURL', '')
                if jd_url and not jd_url.startswith('http'):
                    job_url = f"https://www.naukri.com{jd_url}"
                else:
                    job_url = jd_url or ''
                
                if not job_url or job_url in seen_urls:
                    continue
                seen_urls.add(job_url)
                
                # Filter: only 0-2 years experience
                exp_lower = exp.lower()
                is_fresher = any(k in exp_lower for k in ['0', '1', '2', 'fresher', 'not specified'])
                is_fresher_title = any(k in title.lower() for k in ['fresher', 'entry', 'junior', 'trainee', 'associate', 'graduate', 'intern'])
                
                if not is_fresher and not is_fresher_title:
                    continue
                
                naukri_job_id = str(item.get('jobId', ''))
                
                all_jobs.append({
                    'title': title,
                    'company': comp,
                    'location': loc,
                    'salary': sal,
                    'experience': exp,
                    'skills': skills,
                    'url': job_url,
                    'source': 'Naukri',
                    'naukri_job_id': naukri_job_id,
                    'description': item.get('jobDescription', f'Position for {title} at {comp}.'),
                })
    except Exception as e:
        print(f"  [{query}] ERROR: {e}")

print(f"\n=== Total unique fresher jobs found: {len(all_jobs)} ===\n")

# Insert into DB
inserted = 0
for jdata in all_jobs:
    # Check for duplicates by URL or job_id
    existing_job = db.query(Job).filter(Job.url == jdata['url']).first()
    if existing_job:
        continue
    
    # Generate unique job_id
    job_id_str = f"naukri_{jdata['naukri_job_id']}_{hashlib.md5(jdata['url'].encode()).hexdigest()[:8]}"
    
    existing_by_jid = db.query(Job).filter(Job.job_id == job_id_str).first()
    if existing_by_jid:
        continue
    
    job = Job(
        job_id=job_id_str,
        title=jdata['title'],
        company=jdata['company'],
        location=jdata['location'],
        salary=jdata['salary'],
        experience=jdata['experience'],
        description=jdata['description'][:2000] if jdata['description'] else '',
        url=jdata['url'],
        source=jdata['source'],
        posted_date=datetime.datetime.utcnow(),
    )
    db.add(job)
    db.flush()
    
    # Add skills
    for skill_name in jdata['skills'][:10]:
        db.add(JobSkill(job_id=job.id, name=skill_name))
    
    inserted += 1
    print(f"  [{inserted}] {jdata['title']} @ {jdata['company']} | {jdata['experience']} | {jdata['location']}")

db.commit()
print(f"\n=== Successfully inserted {inserted} fresher jobs into HireMind database! ===")
db.close()
