from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
import datetime
from app.db.session import get_db
from app.models.user import User
from app.models.application import Application
from app.models.job import JobMatch, JobSkill, Job
from app.routers.deps import get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("")
def get_analytics_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Real Total Metrics directly from Database (Aggregated in 1 Single Query for Max Speed)
    apps = db.query(Application.status, Application.notes, Application.created_at).filter(Application.user_id == current_user.id).all()
    
    total_found = db.query(Job).count()
    total_matched = db.query(JobMatch).filter(JobMatch.user_id == current_user.id).count()
    
    total_saved = 0
    total_applied = 0
    total_interviews = 0
    total_offers = 0
    total_outreach_sent = 0
    total_pending_outreach = 0

    now = datetime.datetime.utcnow()
    one_week = datetime.timedelta(days=7)
    w4_start = now - one_week
    w3_start = now - (one_week * 2)
    w2_start = now - (one_week * 3)
    w1_start = now - (one_week * 4)

    w1_count = 0
    w2_count = 0
    w3_count = 0
    w4_count = 0

    for st, notes, created_at in apps:
        st_norm = st or ""
        notes_norm = notes or ""

        if st_norm in ["Saved", "Visited", "Ready", "Review Required"]:
            total_saved += 1
        elif st_norm == "Applied":
            total_applied += 1
        elif st_norm == "Interview":
            total_interviews += 1
        elif st_norm == "Offer":
            total_offers += 1

        if st_norm == "Applied" and "Outreach Email Sent" in notes_norm:
            total_outreach_sent += 1
        
        if st_norm in ["Applied", "Visited"] and "Outreach Email Sent" not in notes_norm:
            total_pending_outreach += 1

        if created_at:
            if created_at >= w4_start:
                w4_count += 1
            elif created_at >= w3_start:
                w3_count += 1
            elif created_at >= w2_start:
                w2_count += 1
            elif created_at >= w1_start:
                w1_count += 1

    applications_trend = [
        {"week": "Week 1", "applications": w1_count},
        {"week": "Week 2", "applications": w2_count},
        {"week": "Week 3", "applications": w3_count},
        {"week": "Week 4", "applications": w4_count}
    ]

    # 2. Real Skill demand from actual user matched jobs
    top_skills_query = db.query(JobSkill.name, func.count(JobSkill.id).label("count"))\
        .join(Job, JobSkill.job_id == Job.id)\
        .join(JobMatch, JobMatch.job_id == Job.id)\
        .filter(JobMatch.user_id == current_user.id)\
        .group_by(JobSkill.name)\
        .order_by(func.count(JobSkill.id).desc())\
        .limit(6).all()
        
    top_skills = [{"name": name, "count": count} for name, count in top_skills_query]

    # 4. Real Match Score Distribution from JobMatch table
    score_ranges = {
        "90-100": 0,
        "80-89": 0,
        "70-79": 0,
        "60-69": 0,
        "<60": 0
    }
    matches = db.query(JobMatch.match_score).filter(JobMatch.user_id == current_user.id).all()
    for m in matches:
        score = m[0] or 0.0
        if score >= 90:
            score_ranges["90-100"] += 1
        elif score >= 80:
            score_ranges["80-89"] += 1
        elif score >= 70:
            score_ranges["70-79"] += 1
        elif score >= 60:
            score_ranges["60-69"] += 1
        else:
            score_ranges["<60"] += 1

    distribution = [{"range": k, "count": v} for k, v in score_ranges.items()]

    # 5. Real Conversion Rates
    interview_rate = round((total_interviews / total_applied) * 100, 1) if total_applied > 0 else 0.0
    offer_rate = round((total_offers / total_applied) * 100, 1) if total_applied > 0 else 0.0

    return {
        "overview": {
            "jobs_found": total_found,
            "jobs_matched": total_matched,
            "applications_prepared": total_saved,
            "applications_submitted": total_applied,
            "interviews": total_interviews,
            "offers": total_offers,
            "outreach_emails_sent": total_outreach_sent,
            "pending_outreach": total_pending_outreach
        },
        "top_skills": top_skills,
        "applications_trend": applications_trend,
        "score_distribution": distribution,
        "interview_rate": interview_rate,
        "offer_rate": offer_rate
    }
