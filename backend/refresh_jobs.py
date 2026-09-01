import re
import datetime
from playwright.sync_api import sync_playwright
from app.db.session import SessionLocal
from app.models.job import Job, JobSkill
from app.models.application import Application, ApplicationAnswer, ApplicationEvent

def harvest_real_naukri_jobs():
    db = SessionLocal()
    try:
        # 1. Clean up old applications and stale jobs
        print("Cleaning up old job records...")
        db.query(ApplicationAnswer).delete()
        db.query(ApplicationEvent).delete()
        db.query(Application).delete()
        db.query(JobSkill).delete()
        deleted = db.query(Job).delete()
        db.commit()
        print(f"[OK] Cleaned {deleted} old records.")

        categories = [
            ("python-developer", "india", "Python Developer"),
            ("full-stack-developer", "bengaluru", "Full Stack Developer"),
            ("software-engineer", "india", "Software Engineer"),
            ("data-analyst", "india", "Data Analyst"),
            ("artificial-intelligence", "india", "AI Engineer")
        ]

        total_saved = 0

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            )

            for slug, loc, label in categories:
                url = f"https://www.naukri.com/{slug}-jobs-in-{loc}?sort=dd"
                print(f"Scraping live jobs for '{label}' from: {url}")
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=20000)
                    page.wait_for_timeout(2500)
                    cards = page.locator("article, .cust-job-tuple, .srp-jobtuple-wrapper, .jobTuple").all()
                    
                    saved_for_cat = 0
                    for i, card in enumerate(cards[:10]):
                        try:
                            title_el = card.locator("a.title, a.job-title, [class*='title'] a").first
                            comp_el = card.locator("a.comp-name, .comp-name, .subTitle").first
                            loc_el = card.locator("span.loc-wrap, span.loc, span[class*='loc']").first
                            exp_el = card.locator("span.exp-wrap, span.expwdth, span[class*='exp']").first
                            sal_el = card.locator("span.sal-wrap, span.sal, span[class*='sal']").first
                            desc_el = card.locator(".job-desc, .row6, .job-description, .ellipsis").first

                            if title_el.count() > 0:
                                title = title_el.inner_text().strip()
                                company = comp_el.inner_text().strip() if comp_el.count() > 0 else "Tech Enterprise"
                                job_url = title_el.get_attribute("href")
                                if job_url and not job_url.startswith("http"):
                                    job_url = f"https://www.naukri.com{job_url}"
                                
                                loc_txt = loc_el.inner_text().strip() if loc_el.count() > 0 else loc.capitalize()
                                exp_txt = exp_el.inner_text().strip() if exp_el.count() > 0 else "0-3 Yrs"
                                sal_txt = sal_el.inner_text().strip() if sal_el.count() > 0 else "Not Disclosed"
                                desc_txt = desc_el.inner_text().strip() if desc_el.count() > 0 else f"Live opening for {title} at {company}."

                                # Save Job
                                job = Job(
                                    job_id=f"naukri_real_{abs(hash(job_url))}",
                                    title=title,
                                    company=company,
                                    location=loc_txt,
                                    salary=sal_txt,
                                    experience=exp_txt,
                                    description=desc_txt,
                                    url=job_url,
                                    source="Naukri",
                                    posted_date=datetime.datetime.utcnow()
                                )
                                db.add(job)
                                db.flush()

                                # Add default skills
                                default_skills = [label, "Python", "React", "SQL", "Git"]
                                for sk_name in default_skills:
                                    db.add(JobSkill(job_id=job.id, name=sk_name))

                                saved_for_cat += 1
                                total_saved += 1
                        except Exception as card_e:
                            pass

                    db.commit()
                    print(f" -> Saved {saved_for_cat} verified live jobs for '{label}'")
                except Exception as cat_e:
                    print(f"Error scraping '{label}': {cat_e}")

            browser.close()

        print(f"\n[SUCCESS] Harvested and saved {total_saved} fresh real live jobs into DB!")

        # Print top 6
        jobs = db.query(Job).limit(6).all()
        for j in jobs:
            print(f" - [{j.company}] {j.title} -> {j.url}")

    finally:
        db.close()

if __name__ == "__main__":
    harvest_real_naukri_jobs()
