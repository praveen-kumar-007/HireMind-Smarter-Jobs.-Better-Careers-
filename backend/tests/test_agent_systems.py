import os
import sys
import pytest

# Ensure backend directory is in path regardless of runner context
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.match_service import match_service
from app.services.automation_service import browser_manager

@pytest.mark.unit
def test_hybrid_matching_perfect_overlap():
    """Verify that a perfect overlap of skills, experience, and location yields a high matching score."""
    resume_text = "Name: Praveen Kumar. Skills: React, Node, Python. Education: B.Tech in Computer Science from Swami Vivekananda University. Location: Dhanbad."
    job_desc = "We are seeking a Backend Developer skilled in Python. Must have B.Tech in Computer Science."
    
    scores = match_service.calculate_match_score(
        resume_text=resume_text,
        job_desc=job_desc,
        resume_skills=["React", "Node", "Python"],
        job_skills=["Python"],
        resume_location="Dhanbad",
        job_location="Remote",
        resume_exp_years=2.0,
        job_exp_desc="1 year experience"
    )
    
    assert scores["match_score"] >= 80.0
    assert scores["skill_match"] == 100.0
    assert scores["experience_match"] == 100.0
    assert scores["location_match"] == 100.0

def test_hybrid_matching_low_overlap():
    """Verify that matching score scales down if skills and experience do not align."""
    resume_text = "Skills: React. Experience: 0.5 years."
    job_desc = "Looking for Senior Python Developer with 5+ years of experience."
    
    scores = match_service.calculate_match_score(
        resume_text=resume_text,
        job_desc=job_desc,
        resume_skills=["React"],
        job_skills=["Python", "Docker", "AWS"],
        resume_location="Dhanbad",
        job_location="Bangalore",
        resume_exp_years=0.5,
        job_exp_desc="5 years"
    )
    
    # Matching score must decay because of missing skills and 5 years experience requirement
    assert scores["match_score"] < 60.0
    assert scores["skill_match"] == 0.0

def test_verification_agent_valid():
    """Verify that verification agent passes if core profile fields exist."""
    candidate_profile = {
        "name": "Praveen Kumar",
        "email": "praveen.pr105@gmail.com",
        "phone": "+919504904499"
    }
    res = browser_manager.verify_candidate_fields(candidate_profile)
    assert res["valid"] is True

def test_verification_agent_invalid():
    """Verify that verification agent blocks submission if candidate name is missing."""
    candidate_profile = {
        "email": "praveen.pr105@gmail.com",
        "phone": "+919504904499"
    }
    res = browser_manager.verify_candidate_fields(candidate_profile)
    assert res["valid"] is False
    assert "Full name is missing" in res["errors"]
