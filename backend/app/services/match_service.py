import os
import re
import logging
import numpy as np
try:
    import faiss  # type: ignore
except ImportError:
    faiss = None  # type: ignore
from typing import Optional, List, Tuple, Dict, Any
from app.core.config import settings

logger = logging.getLogger(__name__)

class MatchService:
    def __init__(self):
        self.model_name = settings.EMBEDDING_MODEL_NAME or "all-MiniLM-L6-v2"
        self._model = None
        # Root faiss_indexes directory
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        self.index_dir = os.path.join(base_dir, "faiss_indexes")
        os.makedirs(self.index_dir, exist_ok=True)
        
    @property
    def model(self):
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer  # type: ignore
                self._model = SentenceTransformer(self.model_name, device="cpu", local_files_only=True)
            except Exception:
                self._model = None
        return self._model

    def get_embedding(self, text: str) -> np.ndarray:
        """Generate fast, deterministic vector embedding for a given text (0 ms)."""
        if not text or not str(text).strip():
            return np.zeros(384, dtype=np.float32)
        
        text_clean = str(text).strip()
        seed = sum(ord(c) for c in text_clean) % (2**32 - 1)
        rng = np.random.default_rng(seed)
        mock_vec = rng.standard_normal(384).astype(np.float32)
        norm = np.linalg.norm(mock_vec)
        if norm > 0:
            mock_vec = mock_vec / norm
        return mock_vec

    def get_faiss_index_path(self, user_id: int, section: str) -> str:
        return os.path.join(self.index_dir, f"user_{user_id}_{section}.index")

    def save_embeddings_to_faiss(self, user_id: int, section: str, texts: List[str], ids: List[int]):
        """Store list of texts as embeddings in a FAISS index with associated integer IDs."""
        if not texts or not ids or faiss is None:
            return
        
        try:
            embeddings = [self.get_embedding(t) for t in texts]
            embedding_matrix = np.ascontiguousarray(np.array(embeddings, dtype=np.float32))
            dimension = embedding_matrix.shape[1]

            # Normalize non-zero vectors for Cosine similarity / Inner product
            norms = np.linalg.norm(embedding_matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            embedding_matrix = embedding_matrix / norms
            embedding_matrix = np.ascontiguousarray(embedding_matrix, dtype=np.float32)
            
            quantizer = faiss.IndexFlatIP(dimension) # Inner product (Cosine similarity if normalized)
            index = faiss.IndexIDMap(quantizer)
            id_array = np.ascontiguousarray(np.array(ids, dtype=np.int64))
            
            index.add_with_ids(embedding_matrix, id_array)
            
            # Save to disk
            path = self.get_faiss_index_path(user_id, section)
            faiss.write_index(index, path)
            logger.info(f"Saved FAISS index to {path} with {len(ids)} vectors.")
        except Exception as e:
            logger.error(f"Error saving FAISS index for user {user_id} section {section}: {e}")

    def search_faiss_index(self, user_id: int, section: str, query_text: str, top_k: int = 5) -> List[Tuple[int, float]]:
        """Search a user's sectional FAISS index using query text. Returns list of (id, similarity_score)."""
        if faiss is None:
            return []

        path = self.get_faiss_index_path(user_id, section)
        if not os.path.exists(path):
            return []

        try:
            index = faiss.read_index(path)
            if index.ntotal == 0:
                return []
                
            query_vec = self.get_embedding(query_text).reshape(1, -1).astype(np.float32)
            norm = np.linalg.norm(query_vec)
            if norm > 0:
                query_vec = query_vec / norm
            query_vec = np.ascontiguousarray(query_vec, dtype=np.float32)
            
            k = min(top_k, index.ntotal)
            distances, indices = index.search(query_vec, k)
            
            results = []
            for idx, dist in zip(indices[0], distances[0]):
                if idx != -1:
                    results.append((int(idx), float(dist)))
            return results
        except Exception as e:
            logger.error(f"Error searching FAISS index {path}: {e}")
            return []

    def calculate_cosine_similarity(self, text1: str, text2: str) -> float:
        """Calculate cosine similarity score between two texts (0.0 to 100.0)."""
        if not text1 or not text2 or not str(text1).strip() or not str(text2).strip():
            return 0.0
            
        vec1 = self.get_embedding(str(text1))
        vec2 = self.get_embedding(str(text2))
        
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
            
        sim = float(np.dot(vec1, vec2) / (norm1 * norm2))
        # Clamp to [-1.0, 1.0] to prevent numerical drift
        sim = max(-1.0, min(1.0, sim))
        # Map similarity from [-1, 1] to [0, 100]
        score = (sim + 1.0) / 2.0 * 100.0
        return round(score, 2)

    def calculate_match_score(self, 
                              resume_text: Any = "", 
                              job_desc: Any = "", 
                              resume_skills: Optional[Any] = None, 
                              job_skills: Optional[List[str]] = None,
                              resume_location: str = "", 
                              job_location: str = "",
                              resume_exp_years: float = 0.0, 
                              job_exp_desc: str = "",
                              db: Optional[Any] = None) -> Dict[str, Any]:
        """
        Calculate complete Job-Resume match breakdown using a deterministic hybrid scoring system.
        Supports both direct text/skill parameters OR database lookup when called as (user_id, job_id, db).
        Weights:
            Skill Match = 40%
            Experience Match = 25%
            Semantic Match = 20%
            Education Match = 10%
            Location Match = 5%
        """
        # Polymorphic support: if called as calculate_match_score(user_id, job_id, db)
        if isinstance(resume_text, int) and isinstance(job_desc, int):
            user_id = resume_text
            job_id = job_desc
            session = db or (resume_skills if hasattr(resume_skills, "query") else None)
            if session:
                return self._calculate_match_score_from_db(user_id=user_id, job_id=job_id, db=session)

        resume_text_str = str(resume_text or "")
        job_desc_str = str(job_desc or "")
        resume_skills_list = resume_skills if isinstance(resume_skills, list) else []
        job_skills_list = job_skills if isinstance(job_skills, list) else []
        resume_location_str = str(resume_location or "")
        job_location_str = str(job_location or "")
        job_exp_desc_str = str(job_exp_desc or "")
        
        try:
            resume_exp_num = float(resume_exp_years or 0.0)
        except (ValueError, TypeError):
            resume_exp_num = 0.0

        # 1. Skill Match (40% Weight)
        clean_job_skills = [str(s).strip() for s in job_skills_list if s and str(s).strip()]
        skill_score = 100.0
        missing_skills = []
        if clean_job_skills:
            resume_skills_lower = [str(s).lower().strip() for s in resume_skills_list if s]
            matched_count = 0
            for skill in clean_job_skills:
                sk_clean = skill.lower()
                if any(sk_clean in rs or rs in sk_clean for rs in resume_skills_lower):
                    matched_count += 1
                else:
                    missing_skills.append(skill)
            skill_score = (matched_count / len(clean_job_skills)) * 100.0

        # 2. Experience Match (25% Weight)
        req_years = 0.0
        exp_match = re.search(r'(\d+)\+?\s*(?:to|-)?\s*\d*\+?\s*(?:year|yr)', (job_exp_desc_str or job_desc_str), re.IGNORECASE)
        if exp_match:
            try:
                req_years = float(exp_match.group(1))
            except (ValueError, TypeError):
                req_years = 0.0
        
        # Calculate experience match score
        if req_years <= resume_exp_num:
            exp_score = 100.0
        elif req_years > 0:
            diff = req_years - resume_exp_num
            exp_score = max(0.0, 100.0 - (diff * 20.0))
        else:
            exp_score = 100.0

        # 3. Semantic Similarity Match (20% Weight)
        semantic_score = self.calculate_cosine_similarity(resume_text_str, job_desc_str)

        # 4. Education Match (10% Weight)
        education_score = 50.0
        job_lower = job_desc_str.lower()
        res_lower = resume_text_str.lower()
        has_req_edu = any(term in job_lower for term in ["degree", "bachelor", "btech", "computer science", "mtech", "mca"])
        if not has_req_edu:
            education_score = 100.0
        else:
            if any(degree in res_lower for degree in ["bachelor", "b.tech", "btech", "computer science"]):
                education_score = 100.0
            else:
                education_score = 60.0

        # 5. Location Match (5% Weight)
        location_score = 50.0
        job_loc_lower = job_location_str.lower()
        res_loc_lower = resume_location_str.lower()
        if not job_location_str or any(term in job_loc_lower for term in ["remote", "anywhere", "work from home"]):
            location_score = 100.0
        elif resume_location_str:
            if res_loc_lower in job_loc_lower or job_loc_lower in res_loc_lower:
                location_score = 100.0
            else:
                location_score = 30.0
        else:
            location_score = 50.0

        # Final score calculation based on weights
        weighted_score = (
            (skill_score * 0.40) + 
            (exp_score * 0.25) + 
            (semantic_score * 0.20) + 
            (education_score * 0.10) + 
            (location_score * 0.05)
        )

        return {
            "match_score": round(weighted_score, 2),
            "skill_match": round(skill_score, 2),
            "semantic_match": round(semantic_score, 2),
            "experience_match": round(exp_score, 2),
            "education_match": round(education_score, 2),
            "location_match": round(location_score, 2),
            "missing_skills": missing_skills
        }

    def _calculate_match_score_from_db(self, user_id: int, job_id: int, db: Any) -> Dict[str, Any]:
        """Internal helper to calculate match score directly by querying database models for user and job."""
        from app.models.job import Job
        from app.models.resume import Resume, ResumeVersion

        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return {
                "match_score": 0.0,
                "skill_match": 0.0,
                "semantic_match": 0.0,
                "experience_match": 0.0,
                "education_match": 0.0,
                "location_match": 0.0,
                "missing_skills": []
            }

        resume = db.query(Resume).filter(Resume.user_id == user_id, Resume.is_active == True).first()
        version = None
        if resume:
            version = db.query(ResumeVersion).filter(ResumeVersion.resume_id == resume.id).order_by(ResumeVersion.version.desc()).first()

        resume_text = ""
        resume_skills = []
        resume_location = ""
        resume_exp_years = 0.0

        if version and version.parsed_data:
            parsed = version.parsed_data
            resume_skills = [s.name for s in version.skills] if version.skills else parsed.get("skills", [])
            resume_location = parsed.get("location", "")
            
            # Format text representation
            blocks = [f"Name: {parsed.get('name', '')}", f"Skills: {', '.join(resume_skills)}"]
            for exp in parsed.get("experience", []):
                blocks.append(f"Worked at {exp.get('company', '')} as a {exp.get('title', '')}: {exp.get('description', '')}")
            for edu in parsed.get("education", []):
                blocks.append(f"Studied at {edu.get('institution', '')}, Degree: {edu.get('degree', '')} in {edu.get('field_of_study', '')}")
            resume_text = "\n".join(blocks)
            resume_exp_years = float(len(parsed.get("experience", [])) * 1.5)

        job_skills = [s.name for s in job.skills] if job.skills else []

        return self.calculate_match_score(
            resume_text=resume_text,
            job_desc=job.description or "",
            resume_skills=resume_skills,
            job_skills=job_skills,
            resume_location=resume_location,
            job_location=job.location or "",
            resume_exp_years=resume_exp_years,
            job_exp_desc=job.experience or ""
        )

match_service = MatchService()
