import re
import io
import json
import logging
import requests
import PyPDF2
import docx
from sqlalchemy.orm import Session
from app.models.resume import Resume, ResumeVersion, Skill, Project, Education, Experience
from app.models.user import Profile
from app.services.match_service import match_service
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

COMMON_SKILLS = [
    "python", "javascript", "typescript", "react", "vue", "angular", "node", "express",
    "fastapi", "django", "flask", "java", "spring", "c++", "c#", "golang", "php", "laravel",
    "ruby", "rails", "sql", "postgresql", "mysql", "sqlite", "mongodb", "redis", "cassandra",
    "docker", "kubernetes", "aws", "gcp", "azure", "faiss", "git", "github", "gitlab", "html",
    "css", "sass", "bootstrap", "tailwind", "rest api", "graphql", "machine learning", "nlp",
    "deep learning", "pytorch", "tensorflow", "scikit-learn", "numpy", "pandas", "playwright",
    "selenium", "jenkins", "ci/cd", "jira", "linux", "bash", "agile", "scrum", "microservices"
]

def extract_text_from_pdf(file_bytes: bytes) -> str:
    text = ""
    try:
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            content = page.extract_text()
            if content:
                text += content + "\n"
    except Exception as e:
        logger.error(f"Error reading PDF: {e}")
    return text

def extract_text_from_docx(file_bytes: bytes) -> str:
    text = ""
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        for para in doc.paragraphs:
            text += para.text + "\n"
    except Exception as e:
        logger.error(f"Error reading DOCX: {e}")
    return text

class ResumeService:
    def extract_text(self, filename: str, content: bytes) -> str:
        if filename.lower().endswith(".pdf"):
            return extract_text_from_pdf(content)
        elif filename.lower().endswith(".docx"):
            return extract_text_from_docx(content)
        else:
            raise ValueError("Unsupported file format. Please upload a PDF or DOCX file.")

    def parse_with_heuristics(self, text: str) -> dict:
        """Heuristic parser as a robust fallback."""
        parsed = {
            "name": "",
            "email": "",
            "phone": "",
            "location": "",
            "linkedin": "",
            "github": "",
            "skills": [],
            "education": [],
            "experience": [],
            "projects": []
        }

        # 1. Email Regex
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        if email_match:
            parsed["email"] = email_match.group(0)

        # 2. Phone Regex
        phone_match = re.search(r'\+?\d[\d -]{8,12}\d', text)
        if phone_match:
            parsed["phone"] = phone_match.group(0)

        # 3. URLs
        linkedin_match = re.search(r'linkedin\.com/in/[\w-]+', text, re.IGNORECASE)
        if linkedin_match:
            parsed["linkedin"] = "https://" + linkedin_match.group(0)
            
        github_match = re.search(r'github\.com/[\w-]+', text, re.IGNORECASE)
        if github_match:
            parsed["github"] = "https://" + github_match.group(0)

        # 4. Name extraction fallback (usually first 1 or 2 lines)
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        if lines:
            # Take the first line if it looks like a name (short, capitalized words)
            first_line = lines[0]
            if len(first_line) < 50 and any(c.isupper() for c in first_line):
                parsed["name"] = first_line

        # 5. Skill dictionary lookup
        text_lower = text.lower()
        extracted_skills = []
        for skill in COMMON_SKILLS:
            # Use word boundary boundaries for short skills (e.g. git, node)
            if len(skill) <= 4:
                pattern = r'\b' + re.escape(skill) + r'\b'
            else:
                pattern = re.escape(skill)
                
            if re.search(pattern, text_lower):
                extracted_skills.append(skill.title())
        parsed["skills"] = list(set(extracted_skills))

        # 6. Education/Experience/Projects section parser
        # Simple splitting strategy
        sections = {"experience": [], "education": [], "projects": []}
        current_section = None
        
        for line in lines:
            line_lower = line.lower()
            if any(h in line_lower for h in ["experience", "work history", "employment"]):
                current_section = "experience"
                continue
            elif any(h in line_lower for h in ["education", "academic"]):
                current_section = "education"
                continue
            elif any(h in line_lower for h in ["project", "personal projects", "key projects"]):
                current_section = "projects"
                continue
            
            if current_section and len(line) > 10:
                sections[current_section].append(line)

        # Build basic experience structures
        if sections["experience"]:
            parsed["experience"].append({
                "company": "Company Name (extracted)",
                "title": "Job Title (extracted)",
                "location": "Location (extracted)",
                "start_date": "",
                "end_date": "",
                "description": "\n".join(sections["experience"][:8])
            })
            
        # Build basic education structures
        if sections["education"]:
            parsed["education"].append({
                "institution": "Institution (extracted)",
                "degree": "Degree / Field (extracted)",
                "field_of_study": "",
                "start_date": "",
                "end_date": "",
                "gpa": ""
            })

        # Build basic projects structures
        for i, proj_line in enumerate(sections["projects"][:3]):
            parsed["projects"].append({
                "title": f"Project {i+1}",
                "description": proj_line,
                "technologies": []
            })

        return parsed

    def parse_with_llm(self, text: str, ollama_url: str) -> dict:
        """Parse resume details using local Ollama model (with fallback)."""
        prompt = f"""You are a professional resume parsing engine. Extract the structured details from the following resume text and format it STRICTLY as a valid JSON object. Do not add any markdown, explanation or text before/after the JSON.

JSON Schema format to follow:
{{
  "name": "Full Name",
  "email": "Email Address",
  "phone": "Phone Number",
  "location": "City, State/Country",
  "linkedin": "LinkedIn profile link",
  "github": "GitHub profile link",
  "skills": ["Skill1", "Skill2", ...],
  "education": [
    {{
      "institution": "University Name",
      "degree": "Degree (e.g. Bachelor of Science)",
      "field_of_study": "Computer Science / Electrical Eng etc",
      "start_date": "MM/YYYY or YYYY",
      "end_date": "MM/YYYY or YYYY or Present",
      "gpa": "GPA value"
    }}
  ],
  "experience": [
    {{
      "company": "Company Name",
      "title": "Job Title",
      "location": "City, State",
      "start_date": "MM/YYYY",
      "end_date": "MM/YYYY or Present",
      "description": "Details of roles and achievements"
    }}
  ],
  "projects": [
    {{
      "title": "Project Title",
      "description": "Description of project",
      "technologies": ["React", "Python", ...]
    }}
  ]
}}

Resume text to parse:
{text[:4000]}
"""
        try:
            # We call the centralized ai_service with task_type "extraction" -> maps to qwen3:4b
            parsed_json = ai_service.ask_ollama_json(
                prompt=prompt,
                task_type="extraction",
                retries=1
            )
            return parsed_json
        except Exception as e:
            logger.warning(f"Ollama parsing failed: {e}. Falling back to heuristics.")
        
        return self.parse_with_heuristics(text)

    def parse_resume(self, text: str, ollama_url: str) -> dict:
        """Parsing hub trying LLM first, falling back to heuristics."""
        parsed = self.parse_with_llm(text, ollama_url)
        # Verify core fields exist
        for key in ["name", "email", "phone", "location", "skills", "education", "experience", "projects"]:
            if key not in parsed:
                parsed[key] = [] if key in ["skills", "education", "experience", "projects"] else ""
        return parsed

    def save_parsed_resume(self, db: Session, user_id: int, file_path: str, parsed_data: dict) -> ResumeVersion:
        # 1. Create or get the Resume record
        resume = db.query(Resume).filter(Resume.user_id == user_id, Resume.is_active == True).first()
        if not resume:
            resume = Resume(user_id=user_id, file_path=file_path, is_active=True)
            db.add(resume)
            db.commit()
            db.refresh(resume)
        
        # 2. Get next version number
        latest_version = db.query(ResumeVersion).filter(ResumeVersion.resume_id == resume.id).order_by(ResumeVersion.version.desc()).first()
        version_num = (latest_version.version + 1) if latest_version else 1
        
        # 3. Create ResumeVersion
        resume_version = ResumeVersion(
            resume_id=resume.id,
            version=version_num,
            file_path=file_path,
            parsed_data=parsed_data
        )
        db.add(resume_version)
        db.commit()
        db.refresh(resume_version)
        
        # 4. Save individual sections for querying
        # Skills
        for skill_name in parsed_data.get("skills", []):
            db_skill = Skill(resume_version_id=resume_version.id, name=skill_name)
            db.add(db_skill)
            
        # Education
        for edu in parsed_data.get("education", []):
            db_edu = Education(
                resume_version_id=resume_version.id,
                institution=edu.get("institution", ""),
                degree=edu.get("degree", ""),
                field_of_study=edu.get("field_of_study", ""),
                start_date=edu.get("start_date", ""),
                end_date=edu.get("end_date", ""),
                gpa=edu.get("gpa", "")
            )
            db.add(db_edu)
            
        # Experience
        for exp in parsed_data.get("experience", []):
            db_exp = Experience(
                resume_version_id=resume_version.id,
                company=exp.get("company", ""),
                title=exp.get("title", ""),
                location=exp.get("location", ""),
                start_date=exp.get("start_date", ""),
                end_date=exp.get("end_date", ""),
                description=exp.get("description", "")
            )
            db.add(db_exp)
            
        # Projects
        for proj in parsed_data.get("projects", []):
            db_proj = Project(
                resume_version_id=resume_version.id,
                title=proj.get("title", ""),
                description=proj.get("description", ""),
                technologies=proj.get("technologies", [])
            )
            db.add(db_proj)
            
        db.commit()
        
        # 5. Update user profile details from parsed resume if they are empty
        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        if profile:
            if not profile.full_name and parsed_data.get("name"):
                profile.full_name = parsed_data.get("name")
            if not profile.phone and parsed_data.get("phone"):
                profile.phone = parsed_data.get("phone")
            if not profile.location and parsed_data.get("location"):
                profile.location = parsed_data.get("location")
            db.commit()

        # 6. Index sections in FAISS
        self.index_resume_version_in_faiss(user_id, resume_version)
        
        return resume_version

    def index_resume_version_in_faiss(self, user_id: int, version: ResumeVersion):
        """Index skills, experience descriptions, and project details in sectional FAISS databases."""
        # Index skills
        skills = [s.name for s in version.skills]
        if skills:
            skill_ids = [s.id for s in version.skills]
            match_service.save_embeddings_to_faiss(user_id, "skills", skills, skill_ids)

        # Index experience descriptions
        experiences = [f"{e.title} at {e.company}: {e.description}" for e in version.experience if e.description]
        if experiences:
            exp_ids = [e.id for e in version.experience if e.description]
            match_service.save_embeddings_to_faiss(user_id, "experience", experiences, exp_ids)

        # Index project descriptions
        projects = [f"{p.title}: {p.description}" for p in version.projects if p.description]
        if projects:
            proj_ids = [p.id for p in version.projects if p.description]
            match_service.save_embeddings_to_faiss(user_id, "projects", projects, proj_ids)

resume_service = ResumeService()
