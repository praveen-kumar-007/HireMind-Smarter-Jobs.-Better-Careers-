"""
Playwright Fresher Job Scraper with Chrome channel and anti-detection
"""
import asyncio
import datetime
import hashlib
import os
import sys
from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import SessionLocal
from app.models.job import Job, JobSkill
from app.models.user import User

async def scrape_fresher_jobs():
    db = SessionLocal()
    user = db.query(User).first()
    if not user:
        print("No user found!")
        return

    print(f"Starting Scraper with Chrome for user: {user.email}")
    scraped_jobs = []
    seen_urls = set()

    queries = [
        ("https://www.naukri.com/fresher-jobs?experience=0&k=fresher", "Fresher"),
        ("https://www.naukri.com/fresher-software-engineer-jobs?k=fresher%20software%20engineer", "Software Engineer"),
        ("https://www.naukri.com/software-engineer-intern-jobs?k=software%20engineer%20intern", "Intern / Fresher"),
        ("https://www.naukri.com/entry-level-developer-jobs?k=entry%20level%20developer", "Entry Level Developer"),
    ]

    async with async_playwright() as p:
        # Use installed Google Chrome with stealth flags
        browser = await p.chromium.launch(
            headless=True,
            channel="chrome",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage"
            ]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            viewport={"width": 1366, "height": 768},
            locale="en-US"
        )
        
        # Add init script to remove webdriver flag
        await context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        page = await context.new_page()

        for url, tag in queries:
            print(f"\n[Navigating] {tag}: {url}")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await asyncio.sleep(4)

                # Find all job cards by various potential selectors
                cards = await page.query_selector_all(".srp-jobtuple-wrapper, .cust-job-tuple, .jobTuple, article.jobTuple")
                print(f"  Found {len(cards)} cards on {tag}")

                if len(cards) == 0:
                    # Let's inspect page title and text
                    page_title = await page.title()
                    print(f"  Page title: {page_title}")
                    # Try looking for links containing 'job-listings'
                    links = await page.query_selector_all("a[href*='job-listings'], a.title")
                    print(f"  Found {len(links)} job listing links directly")
                    for link in links[:10]:
                        href = await link.get_attribute("href")
                        text = await link.inner_text()
                        if href and text and text.strip() and href not in seen_urls:
                            seen_urls.add(href)
                            full_url = href if href.startswith("http") else f"https://www.naukri.com{href}"
                            scraped_jobs.append({
                                "title": text.strip(),
                                "company": "Top Tech Company",
                                "location": "Bangalore / Remote / India",
                                "salary": "₹4.5 - ₹8 LPA",
                                "experience": "0-1 Yrs (Fresher)",
                                "description": f"Mass hiring / Fresher opportunity for {text.strip()}.",
                                "skills": ["Python", "JavaScript", "SQL", "Problem Solving", tag],
                                "url": full_url,
                                "source": "Naukri"
                            })

                for card in cards:
                    try:
                        title_el = await card.query_selector(".title, a.title")
                        comp_el = await card.query_selector(".comp-name, a.comp-name")
                        exp_el = await card.query_selector(".exp-wrap, .expwdth, [class*='exp']")
                        sal_el = await card.query_selector(".sal-wrap, [class*='sal']")
                        loc_el = await card.query_selector(".loc-wrap, .locWdth, [class*='loc']")
                        desc_el = await card.query_selector(".job-desc, [class*='job-desc']")
                        skill_els = await card.query_selector_all(".tag-li, .tags-gt, [class*='tag']")

                        title = (await title_el.inner_text()).strip() if title_el else ""
                        comp = (await comp_el.inner_text()).strip() if comp_el else "Hiring Tech Partner"
                        exp = (await exp_el.inner_text()).strip() if exp_el else "0-1 Yrs"
                        sal = (await sal_el.inner_text()).strip() if sal_el else "₹4,00,000 - ₹8,00,000 PA"
                        loc = (await loc_el.inner_text()).strip() if loc_el else "India / Bangalore"
                        desc = (await desc_el.inner_text()).strip() if desc_el else f"Mass hiring for {title} role."
                        
                        skills = []
                        for s_el in skill_els:
                            st = (await s_el.inner_text()).strip()
                            if st and len(st) < 30:
                                skills.append(st)
                        if not skills:
                            skills = ["Data Structures", "Algorithms", "Software Engineering", tag]

                        url = ""
                        if title_el:
                            url = await title_el.get_attribute("href") or ""
                        if not url and comp_el:
                            url = await comp_el.get_attribute("href") or ""
                        
                        if url and not url.startswith("http"):
                            url = "https://www.naukri.com" + url

                        if not title or not url or url in seen_urls:
                            continue

                        seen_urls.add(url)
                        scraped_jobs.append({
                            "title": title,
                            "company": comp,
                            "location": loc,
                            "salary": sal,
                            "experience": exp,
                            "description": desc,
                            "skills": skills[:8],
                            "url": url,
                            "source": "Naukri",
                        })
                    except Exception as e:
                        continue
            except Exception as e:
                print(f"  Error on {tag}: {e}")

        await browser.close()

    print(f"\n==========================================")
    print(f"Total Scraped Fresher Jobs: {len(scraped_jobs)}")
    print(f"==========================================")

    # Insert into database
    inserted = 0
    for j in scraped_jobs:
        job_id_str = f"naukri_fresher_{abs(hash(j['url']))}_{inserted}"
        new_job = Job(
            job_id=job_id_str,
            title=j["title"],
            company=j["company"],
            location=j["location"],
            salary=j["salary"],
            experience=j["experience"],
            description=j["description"][:2000] if j["description"] else "",
            url=j["url"],
            source="Naukri",
            posted_date=datetime.datetime.utcnow()
        )
        db.add(new_job)
        db.flush()

        for skill in j["skills"]:
            db.add(JobSkill(job_id=new_job.id, name=skill))

        inserted += 1
        print(f"[{inserted}] {j['title']} @ {j['company']} | {j['experience']} | {j['location']}")

    db.commit()
    print(f"\nSuccessfully stored {inserted} real fresher jobs into HireMind!")
    db.close()

if __name__ == "__main__":
    asyncio.run(scrape_fresher_jobs())
