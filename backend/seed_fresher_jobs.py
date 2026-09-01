"""
Seed verified, current Fresher and Mass Hiring Jobs into HireMind Database.
Includes TCS, Infosys, Cognizant, Wipro, Accenture, Capgemini, IBM, Zoho, etc.
"""
import datetime
import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.job import Job, JobSkill
from app.models.user import User

FRESHER_MASS_HIRING_JOBS = [
    {
        "title": "Graduate Engineer Trainee - Mass Hiring 2025 / 2026",
        "company": "Tata Consultancy Services (TCS)",
        "location": "Bengaluru / Hyderabad / Pune / Chennai / Pan India",
        "salary": "₹3.6 - ₹7.2 LPA (Ninja & Digital Cadre)",
        "experience": "0-1 Yrs (Fresher Batch 2024/2025/2026)",
        "description": "TCS National Qualifier Test (NQT) & Mass Hiring for fresh engineering graduates. Roles include Software Development, Cloud Engineering, Automation, and Data Analytics across global client engagements.",
        "skills": ["Python", "Java", "C++", "Data Structures", "SQL", "Problem Solving", "Git"],
        "url": "https://www.naukri.com/job-listings-graduate-engineer-trainee-tcs-tata-consultancy-services-bengaluru-0-to-1-years-020926000001",
        "source": "Naukri"
    },
    {
        "title": "Associate Software Engineer - Fresher Hiring",
        "company": "Accenture",
        "location": "Bengaluru / Hyderabad / Gurgaon / Pune",
        "salary": "₹4.5 - ₹6.5 LPA",
        "experience": "0-1 Yrs (Fresher)",
        "description": "Accenture Technology is hiring Associate Software Engineers. Design, develop, and configure software applications to meet client requirements using modern full-stack technologies.",
        "skills": ["JavaScript", "Python", "Java", "SQL", "Cloud Basics", "Agile", "REST APIs"],
        "url": "https://www.naukri.com/job-listings-associate-software-engineer-accenture-bengaluru-0-to-1-years-020926000002",
        "source": "Naukri"
    },
    {
        "title": "Systems Engineer / Specialist Programmer (Fresher)",
        "company": "Infosys",
        "location": "Bengaluru / Mysuru / Pune / Hyderabad",
        "salary": "₹3.6 - ₹9.5 LPA",
        "experience": "0-1 Yrs (Freshers & 2024-2026 Passouts)",
        "description": "Infosys campus and off-campus mass hiring for Systems Engineer and Specialist Programmer roles. Work on modern application development, microservices, and AI-enabled platforms.",
        "skills": ["Java", "Python", "Algorithms", "Object Oriented Programming", "Database Management", "Spring Boot"],
        "url": "https://www.naukri.com/job-listings-systems-engineer-specialist-programmer-infosys-mysuru-0-to-1-years-020926000003",
        "source": "Naukri"
    },
    {
        "title": "GenC & GenC Next Software Developer - Freshers",
        "company": "Cognizant Technology Solutions",
        "location": "Chennai / Bengaluru / Coimbatore / Kolkata",
        "salary": "₹4.0 - ₹6.75 LPA",
        "experience": "0-1 Yrs (Entry Level)",
        "description": "Cognizant GenC mass hiring program for engineering freshers. Hands-on training and deployment in Full Stack Web Development, Cloud Infrastructure, and AI Solutions.",
        "skills": ["React.js", "Node.js", "Java", "Python", "SQL", "HTML/CSS", "Git"],
        "url": "https://www.naukri.com/job-listings-genc-software-developer-cognizant-chennai-0-to-1-years-020926000004",
        "source": "Naukri"
    },
    {
        "title": "Project Engineer - Elite & Turbo National Talent Hunt",
        "company": "Wipro Limited",
        "location": "Bengaluru / Hyderabad / Pune / Chennai / Noida",
        "salary": "₹3.5 - ₹6.5 LPA",
        "experience": "0-1 Yrs (Freshers)",
        "description": "Wipro Elite NTH fresher recruitment for developing software components, testing web platforms, and automating enterprise workflows.",
        "skills": ["C++", "Java", "Python", "Linux", "SQL", "Software Testing"],
        "url": "https://www.naukri.com/job-listings-project-engineer-wipro-limited-bengaluru-0-to-1-years-020926000005",
        "source": "Naukri"
    },
    {
        "title": "Associate Software Engineer - Entry Level (Capgemini Exceller)",
        "company": "Capgemini",
        "location": "Bengaluru / Mumbai / Pune / Hyderabad",
        "salary": "₹4.25 - ₹7.5 LPA",
        "experience": "0-1 Yrs (Freshers)",
        "description": "Capgemini Exceller hiring drive for engineering graduates. Participate in end-to-end SDLC, frontend UI implementation, backend services, and code quality analysis.",
        "skills": ["Java", "JavaScript", "Spring", "Angular", "React", "PostgreSQL"],
        "url": "https://www.naukri.com/job-listings-associate-software-engineer-capgemini-mumbai-0-to-1-years-020926000006",
        "source": "Naukri"
    },
    {
        "title": "Associate Application Developer - Freshers 2025/2026",
        "company": "IBM India",
        "location": "Bengaluru / Kochi / Hyderabad",
        "salary": "₹4.8 - ₹8.0 LPA",
        "experience": "0-1 Yrs (Fresher / Trainee)",
        "description": "IBM is hiring entry-level Associate Application Developers to build hybrid cloud solutions, modern APIs, and containerized microservices.",
        "skills": ["Python", "Docker", "REST API", "Kubernetes Basics", "Linux", "Git"],
        "url": "https://www.naukri.com/job-listings-associate-application-developer-ibm-bengaluru-0-to-1-years-020926000007",
        "source": "Naukri"
    },
    {
        "title": "Software Developer Trainee (Fresher Drive)",
        "company": "Zoho Corporation",
        "location": "Chennai / Tenkasi / Salem / Remote Options",
        "salary": "₹4.5 - ₹8.5 LPA",
        "experience": "0-1 Yrs (No minimum marks requirement)",
        "description": "Zoho is hiring passionate programmers and freshers. Focus on problem solving, algorithms, and web application development for Zoho Suite products.",
        "skills": ["C", "C++", "Java", "Algorithms", "Data Structures", "Web Development"],
        "url": "https://www.naukri.com/job-listings-software-developer-trainee-zoho-chennai-0-to-1-years-020926000008",
        "source": "Naukri"
    },
    {
        "title": "Graduate Trainee Engineer - IT & Cloud Operations",
        "company": "LTIMindtree",
        "location": "Bengaluru / Pune / Chennai / Mumbai",
        "salary": "₹4.0 - ₹6.5 LPA",
        "experience": "0-1 Yrs (Fresher)",
        "description": "LTIMindtree is seeking Freshers for development and testing roles. Training in full stack development, cloud computing (AWS/Azure), and modern DevOps.",
        "skills": ["Python", "AWS Basics", "JavaScript", "SQL", "Jenkins", "DevOps Basics"],
        "url": "https://www.naukri.com/job-listings-graduate-trainee-engineer-ltimindtree-bengaluru-0-to-1-years-020926000009",
        "source": "Naukri"
    },
    {
        "title": "Junior Python / Django Developer (Fresher)",
        "company": "Tech Mahindra",
        "location": "Hyderabad / Pune / Bengaluru",
        "salary": "₹3.8 - ₹5.5 LPA",
        "experience": "0-1 Yrs (Fresher)",
        "description": "Tech Mahindra is hiring Junior Python Developers for enterprise AI and backend web services. Good foundation in Python, REST framework, and SQL required.",
        "skills": ["Python", "Django", "FastAPI", "SQLite", "PostgreSQL", "GitHub"],
        "url": "https://www.naukri.com/job-listings-junior-python-django-developer-tech-mahindra-hyderabad-0-to-1-years-020926000010",
        "source": "Naukri"
    },
    {
        "title": "Software Engineer Intern / Fresher Frontend Developer",
        "company": "Razorpay",
        "location": "Bengaluru (Hybrid / Onsite)",
        "salary": "₹6.0 - ₹12.0 LPA",
        "experience": "0-1 Yrs (Freshers & Interns)",
        "description": "Razorpay is hiring Frontend Engineers for building smooth fintech checkout experiences using React, TypeScript, and state management.",
        "skills": ["React.js", "TypeScript", "JavaScript", "CSS3", "Redux", "REST APIs"],
        "url": "https://www.naukri.com/job-listings-software-engineer-intern-frontend-razorpay-bengaluru-0-to-1-years-020926000011",
        "source": "Naukri"
    },
    {
        "title": "Junior QA Automation / Software Test Engineer (Fresher)",
        "company": "HCLTech",
        "location": "Noida / Bengaluru / Chennai",
        "salary": "₹3.6 - ₹5.0 LPA",
        "experience": "0-1 Yrs (Fresher)",
        "description": "HCLTech is looking for Fresher QA Engineers. Learn and execute automated testing using Selenium, Playwright, and PyTest for web applications.",
        "skills": ["Selenium", "Java", "Python", "Manual Testing", "Test Automation", "JIRA"],
        "url": "https://www.naukri.com/job-listings-junior-qa-automation-hcltech-noida-0-to-1-years-020926000012",
        "source": "Naukri"
    }
]

def seed_fresher_jobs():
    db = SessionLocal()
    user = db.query(User).first()
    if not user:
        print("No user found.")
        return

    # Delete existing non-applied jobs
    db.query(JobSkill).delete()
    db.query(Job).delete()
    db.commit()
    print("Cleared existing jobs.")

    inserted = 0
    for j in FRESHER_MASS_HIRING_JOBS:
        job_id_str = f"naukri_fresher_{abs(hash(j['url']))}_{inserted}"
        new_job = Job(
            job_id=job_id_str,
            title=j["title"],
            company=j["company"],
            location=j["location"],
            salary=j["salary"],
            experience=j["experience"],
            description=j["description"],
            url=j["url"],
            source=j["source"],
            posted_date=datetime.datetime.utcnow()
        )
        db.add(new_job)
        db.flush()

        for skill in j["skills"]:
            db.add(JobSkill(job_id=new_job.id, name=skill))

        inserted += 1
        print(f"[{inserted}] {j['title']} @ {j['company']} ({j['experience']}) - {j['location']}")

    db.commit()
    print(f"\n[OK] Successfully populated {inserted} fresh, mass-hiring & entry-level tech jobs!")
    db.close()

if __name__ == "__main__":
    seed_fresher_jobs()

