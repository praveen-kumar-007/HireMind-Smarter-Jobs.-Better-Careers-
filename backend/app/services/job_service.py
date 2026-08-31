import datetime
import logging
from abc import ABC, abstractmethod
from sqlalchemy.orm import Session
from app.models.job import Job, JobSkill
from app.models.user import UserPlatformCredential, Profile
from app.services.email_service import email_verification_service
from app.services.ai_service import ai_service
from app.core.config import settings
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

class JobProviderAdapter(ABC):
    @abstractmethod
    def search_jobs(self, db: Session, user_id: int, query: str, location: str, limit: int = 10) -> list[dict]:
        """Search jobs from the provider and return a list of raw job dicts."""
        pass

    @abstractmethod
    def get_job_details(self, job_id: str) -> dict:
        """Fetch full details of a specific job from the provider."""
        pass

    @abstractmethod
    def normalize_job(self, raw_job: dict) -> dict:
        """Map provider-specific fields to our standard schema."""
        pass


class BaseRealAdapter(JobProviderAdapter):
    """Base class providing Playwright browser session orchestration with secure login state."""
    def __init__(self, source_name: str, platform_key: str):
        self.source_name = source_name
        self.platform_key = platform_key

    def search_jobs(self, db: Session, user_id: int, query: str, location: str, limit: int = 30) -> list[dict]:
        jobs = []
        cred = None
        
        # Check experience level filter from user profile
        self.experience_level = "any"
        if user_id:
            profile = db.query(Profile).filter(Profile.user_id == user_id).first()
            if profile:
                self.experience_level = profile.experience_level or "any"
                
        if user_id:
            cred = db.query(UserPlatformCredential).filter(
                UserPlatformCredential.user_id == user_id,
                UserPlatformCredential.platform == self.platform_key,
                UserPlatformCredential.is_active == True
            ).first()

        try:
            with sync_playwright() as p:
                import os
                profile_dir = os.path.abspath(f"app/static/browser_profile_{self.platform_key}")
                os.makedirs(profile_dir, exist_ok=True)
                
                context = p.chromium.launch_persistent_context(
                    user_data_dir=profile_dir,
                    channel="chrome",
                    headless=True,  # Scraper always runs headless (3 parallel browsers)
                    viewport={"width": 1280, "height": 800},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox"
                    ]
                )
                page = context.pages[0] if context.pages else context.new_page()

                # 1. Perform login first if credentials exist to bypass bot check
                if cred:
                    logger.info(f"Logging in to {self.source_name} using stored credentials...")
                    self.login_flow(page, cred, db, user_id)
                    page.wait_for_timeout(3000)

                # 2. Search listings
                jobs = self.scrape_search_results(page, query, location, limit)
                context.close()
                if not jobs:
                    logger.info(f"No active results scraped from {self.source_name}.")
                    jobs = []
        except Exception as e:
            logger.error(f"Error scraping {self.source_name} jobs: {e}")
            jobs = []
            
        return jobs

    def login_flow(self, page, cred, db: Session, user_id: int):
        """Default generic login structure. Overridden by specific platform sub-classes if custom selectors are needed."""
        try:
            if self.platform_key == "linkedin":
                page.goto("https://www.linkedin.com/login", wait_until="load")
                try:
                    page.wait_for_selector("input#username", timeout=2000)
                    page.fill("input#username", cred.username)
                    page.fill("input#password", cred.password)
                    page.click("button[type='submit']")
                    page.wait_for_timeout(3000)
                    if "checkpoint" in page.url or page.locator("input#input-code").is_visible():
                        page.wait_for_timeout(5000)
                        otp = email_verification_service.fetch_latest_otp(db, user_id, "LinkedIn")
                        if otp:
                            page.fill("input#input-code", otp)
                            page.click("button#submit-code")
                except Exception:
                    logger.info("LinkedIn login input not found/active, assuming already logged in.")
            elif self.platform_key == "naukri":
                page.goto("https://www.naukri.com/nlogin/login", wait_until="load")
                try:
                    page.wait_for_selector("input#usernameField", timeout=2000)
                    page.fill("input#usernameField", cred.username)
                    page.wait_for_selector("input#passwordField", timeout=2000)
                    page.fill("input#passwordField", cred.password)
                    page.click("button[type='submit']")
                    page.wait_for_timeout(3000)
                    if "otp" in page.url or page.locator("input[placeholder*='OTP']").is_visible():
                        page.wait_for_timeout(5000)
                        otp = email_verification_service.fetch_latest_otp(db, user_id, "Naukri")
                        if otp:
                            page.fill("input[placeholder*='OTP']", otp)
                            page.click("button:has-text('Verify')")
                except Exception:
                    logger.info("Naukri login input not found/active, assuming already logged in.")
        except Exception as ex:
            logger.warning(f"Login sequence failed for {self.source_name}: {ex}")

    def scrape_search_results(self, page, query: str, location: str, limit: int) -> list[dict]:
        return []

    def get_fallback_jobs(self, query: str, location: str, limit: int) -> list[dict]:
        """Safety fallback details if scraper fails to load the HTML layout."""
        jobs = []
        titles = [f"Senior {query} Dev", f"Full Stack {query} Engineer", f"Associate {query} Analyst"]
        companies = ["Multimarg", "TechCorp", "InnovateLabs"]
        
        # Build a valid search/homepage URL based on the platform key to prevent 404s
        q_encoded = query.replace(" ", "%20")
        l_encoded = location.replace(" ", "%20") if location else "India"
        
        if self.platform_key == "linkedin":
            fallback_url = f"https://www.linkedin.com/jobs/search?keywords={q_encoded}&location={l_encoded}"
        elif self.platform_key == "indeed":
            fallback_url = f"https://www.indeed.com/jobs?q={q_encoded}&l={l_encoded}"
        elif self.platform_key == "naukri":
            fallback_url = f"https://www.naukri.com/{query.lower().replace(' ', '-')}-jobs-in-{location.lower().replace(' ', '-') if location else 'india'}"
        elif self.platform_key == "foundit":
            fallback_url = f"https://www.foundit.in/srp/results?query={q_encoded}&location={l_encoded}"
        elif self.platform_key == "workindia":
            fallback_url = "https://www.workindia.in/jobs/"
        else:
            fallback_url = f"https://www.{self.platform_key}.com/"

        for i in range(min(limit, 3)):
            job_id = f"fallback_{self.platform_key}_{i+1}"
            jobs.append({
                "job_id": job_id,
                "title": titles[i % len(titles)],
                "company": companies[i % len(companies)],
                "location": location or "Remote / Global",
                "salary": "₹8LPA - ₹12LPA",
                "experience": "2 years",
                "skills": [query, "Git", "SQL"],
                "description": f"Position for {titles[i]} at {companies[i]}. Strong skills in {query} required.",
                "url": fallback_url,
                "source": self.source_name,
                "posted_date": datetime.datetime.utcnow() - datetime.timedelta(days=i)
            })
        return jobs

    def get_job_details(self, job_id: str) -> dict:
        return {}

    def normalize_job(self, raw_job: dict) -> dict:
        return raw_job


# Adapters
class LinkedInAdapter(BaseRealAdapter):
    def __init__(self):
        super().__init__("LinkedIn", "linkedin")

    def scrape_search_results(self, page, query: str, location: str, limit: int) -> list[dict]:
        jobs = []
        exp_filter = ""
        exp_level = getattr(self, "experience_level", "any")
        if exp_level == "junior":
            exp_filter = "&f_E=1,2" # Internship & Entry level
        # Filter for jobs uploaded in the last 2 weeks using f_TPR=r1209600, sorted by date (newest first) using sortBy=DD
        search_url = f"https://www.linkedin.com/jobs/search?keywords={query}&location={location}&f_TPR=r1209600{exp_filter}&sortBy=DD"
        page.goto(search_url, wait_until="load")
        try:
            page.wait_for_selector("a.base-card__full-link", timeout=8000)
        except Exception:
            logger.warning("LinkedIn job card not found within 8 seconds.")

        cards = page.locator("li").all()
        for i, card in enumerate(cards[:limit]):
            try:
                title_el = card.locator("h3.base-search-card__title")
                company_el = card.locator("h4.base-search-card__subtitle")
                location_el = card.locator("span.job-search-card__location")
                link_el = card.locator("a.base-card__full-link")

                if title_el.count() > 0 and link_el.count() > 0:
                    title = title_el.inner_text().strip()
                    company = company_el.inner_text().strip() if company_el.count() > 0 else "Unknown Company"
                    loc = location_el.inner_text().strip() if location_el.count() > 0 else location
                    job_url = link_el.get_attribute("href")
                    job_id = f"linkedin_{i}_{hash(job_url)}"
                    
                    jobs.append({
                        "job_id": job_id,
                        "title": title,
                        "company": company,
                        "location": loc,
                        "salary": "Not Specified",
                        "experience": "Not Specified",
                        "skills": [query],
                        "description": f"Position for {title} at {company} in {loc}. Please refer to the application listing details.",
                        "url": job_url,
                        "source": "LinkedIn",
                        "posted_date": datetime.datetime.utcnow()
                    })
            except Exception:
                pass
        return jobs


class NaukriAdapter(BaseRealAdapter):
    def __init__(self):
        super().__init__("Naukri", "naukri")

    def scrape_search_results(self, page, query: str, location: str, limit: int) -> list[dict]:
        import re
        jobs = []
        exp_filter = ""
        exp_level = getattr(self, "experience_level", "any")
        if exp_level == "junior":
            exp_filter = "&experience=0" # 0 years experience for freshers
            
        # Clean query and location to prevent 404 errors with special characters/commas
        clean_query = re.sub(r'[^a-zA-Z0-9\s-]', '', query).strip().replace(' ', '-')
        clean_loc = re.sub(r'[^a-zA-Z0-9\s-]', '', location).strip().replace(' ', '-')
        # If location is worldwide, default to india for Naukri
        if clean_loc.lower() == "worldwide":
            clean_loc = "india"
            
        # Sort by date (newest first) using sort=dd
        url = f"https://www.naukri.com/{clean_query.lower()}-jobs-in-{clean_loc.lower()}?jobAge=30{exp_filter}&sort=dd"
        logger.info(f"Navigating to Naukri search URL: {url}")
        page.goto(url, wait_until="load")
        try:
            page.wait_for_selector(".cust-job-tuple, article", timeout=8000)
        except Exception:
            logger.warning("Naukri job card not found within 8 seconds.")
        
        logger.info(f"Loaded page URL: {page.url} | Title: {page.title()}")
        cards = page.locator(".cust-job-tuple, article").all()
        logger.info(f"Found {len(cards)} Naukri job cards on the page.")
        for i, card in enumerate(cards[:limit]):
            try:
                title_el = card.locator("a.title")
                company_el = card.locator("a.comp-name")
                location_el = card.locator("span.loc-wrap")

                if title_el.count() > 0:
                    title = title_el.inner_text().strip()
                    company = company_el.inner_text().strip() if company_el.count() > 0 else "Unknown Company"
                    loc = location_el.inner_text().strip() if location_el.count() > 0 else location
                    job_url = title_el.get_attribute("href")
                    job_id = f"naukri_{i}_{hash(job_url)}"

                    jobs.append({
                        "job_id": job_id,
                        "title": title,
                        "company": company,
                        "location": loc,
                        "salary": "Not Specified",
                        "experience": "Not Specified",
                        "skills": [query],
                        "description": f"Position for {title} at {company} in {loc}.",
                        "url": job_url,
                        "source": "Naukri",
                        "posted_date": datetime.datetime.utcnow()
                    })
            except Exception:
                pass
        return jobs


class IndeedAdapter(BaseRealAdapter):
    def __init__(self):
        super().__init__("Indeed", "indeed")

    def scrape_search_results(self, page, query: str, location: str, limit: int) -> list[dict]:
        jobs = []
        exp_filter = ""
        exp_level = getattr(self, "experience_level", "any")
        if exp_level == "junior":
            exp_filter = "&explvl=entry_level"
        # Filter for jobs uploaded in the last 30 days using fromage=30
        page.goto(f"https://www.indeed.com/jobs?q={query}&l={location}&fromage=30{exp_filter}", wait_until="load")
        try:
            page.wait_for_selector(".job_seen_beacon", timeout=8000)
        except Exception:
            logger.warning("Indeed job card not found within 8 seconds.")

        cards = page.locator(".job_seen_beacon").all()
        for i, card in enumerate(cards[:limit]):
            try:
                title_el = card.locator("h2.jobTitle span")
                company_el = card.locator("[data-testid='company-name']")
                location_el = card.locator("[data-testid='text-location']")
                link_el = card.locator("h2.jobTitle a")

                if title_el.count() > 0:
                    title = title_el.inner_text().strip()
                    company = company_el.inner_text().strip() if company_el.count() > 0 else "Unknown Company"
                    loc = location_el.inner_text().strip() if location_el.count() > 0 else location
                    raw_href = link_el.get_attribute("href")
                    if raw_href:
                        if raw_href.startswith("http"):
                            job_url = raw_href
                        else:
                            from urllib.parse import urlparse
                            parsed_url = urlparse(page.url)
                            base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
                            if raw_href.startswith("/"):
                                job_url = f"{base_url}{raw_href}"
                            else:
                                job_url = f"{base_url}/{raw_href}"
                    else:
                        job_url = page.url
                    job_id = f"indeed_{i}_{hash(job_url)}"

                    jobs.append({
                        "job_id": job_id,
                        "title": title,
                        "company": company,
                        "location": loc,
                        "salary": "Not Specified",
                        "experience": "Not Specified",
                        "skills": [query],
                        "description": f"Position for {title} at {company} in {loc}.",
                        "url": job_url,
                        "source": "Indeed",
                        "posted_date": datetime.datetime.utcnow()
                    })
            except Exception:
                pass
        return jobs


class CompanyWebsiteAdapter(BaseRealAdapter):
    """Scrapes direct career portal postings from official corporate websites and Google Jobs."""
    def __init__(self):
        super().__init__("Company Website", "company_website")

    def scrape_search_results(self, page, query: str, location: str, limit: int) -> list[dict]:
        jobs = []
        try:
            q_enc = query.replace(" ", "+")
            loc_enc = location.replace(" ", "+") if location else "India"
            search_url = f"https://www.google.com/search?q={q_enc}+jobs+in+{loc_enc}+careers+company+website&ibp=htl;jobs"
            logger.info(f"Navigating to Company Website / Direct Careers: {search_url}")
            page.goto(search_url, wait_until="load", timeout=12000)
            page.wait_for_timeout(3000)
            
            cards = page.locator("li.PUpOsf, div[jsname='MydkWb'], div[data-job-id]").all()
            for i, card in enumerate(cards[:limit]):
                try:
                    title_el = card.locator("div.BjJfJf, div[role='heading'], h2, .KLsYvd")
                    company_el = card.locator("div.vNEEBe, .nJlQNd, [aria-label*='Company']")
                    location_el = card.locator("div.Qk80Jf, .QusWhf")
                    
                    title = title_el.inner_text().strip() if title_el.count() > 0 else f"{query} Engineer"
                    company = company_el.inner_text().strip() if company_el.count() > 0 else "Tech Enterprise"
                    loc = location_el.inner_text().strip() if location_el.count() > 0 else (location or "India")
                    
                    link_el = card.locator("a[href^='http']")
                    url = link_el.first.get_attribute("href") if link_el.count() > 0 else f"https://careers.google.com/jobs/results/?q={q_enc}"
                    
                    job_id = f"company_web_{i}_{abs(hash(title + company))}"
                    jobs.append({
                        "job_id": job_id,
                        "title": title,
                        "company": company,
                        "location": loc,
                        "salary": "Competitive",
                        "experience": "Relevant Experience",
                        "skills": [query, "Direct Hire"],
                        "description": f"Direct official company career posting for {title} at {company}. Apply directly on the corporate portal.",
                        "url": url,
                        "source": "Company Website",
                        "posted_date": datetime.datetime.utcnow()
                    })
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Direct company website scrape failed: {e}")
        return jobs

    def get_fallback_jobs(self, query: str, location: str, limit: int) -> list[dict]:
        companies = ["Microsoft Careers", "Amazon Jobs", "Google Careers", "Infosys Careers", "Accenture Careers", "TCS Careers"]
        titles = [f"{query} Specialist", f"Senior {query} Engineer", f"Lead {query} Architect", f"{query} Developer"]
        urls = [
            "https://careers.microsoft.com/",
            "https://amazon.jobs/",
            "https://careers.google.com/",
            "https://www.infosys.com/careers/",
            "https://www.accenture.com/careers",
            "https://www.tcs.com/careers"
        ]
        jobs = []
        for i in range(min(limit, len(companies))):
            jobs.append({
                "job_id": f"company_web_direct_{i+1}",
                "title": titles[i % len(titles)],
                "company": companies[i],
                "location": location or "Bangalore, India",
                "salary": "₹12LPA - ₹24LPA",
                "experience": "2-5 years",
                "skills": [query, "Direct Hire"],
                "description": f"Direct official career posting for {titles[i % len(titles)]} at {companies[i]}. Apply directly through the official corporate portal.",
                "url": urls[i % len(urls)],
                "source": "Company Website",
                "posted_date": datetime.datetime.utcnow() - datetime.timedelta(days=i)
            })
        return jobs


def job_to_dict(job: Job) -> dict:
    return {
        "id": job.id,
        "job_id": job.job_id,
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "salary": job.salary,
        "experience": job.experience,
        "description": job.description,
        "url": job.url,
        "source": job.source,
        "posted_date": job.posted_date,
        "created_at": job.created_at,
        "skills": [{"id": s.id, "name": s.name} for s in job.skills]
    }


class JobDiscoveryService:
    def __init__(self):
        self.adapters = {
            "naukri": NaukriAdapter(),
            "linkedin": LinkedInAdapter(),
            "company_website": CompanyWebsiteAdapter()
        }

    def discover_and_save_jobs(self, db: Session, query: str, location: str, providers: list[str] = None, user_id: int = None, save_to_db: bool = False) -> list:
        import concurrent.futures
        import binascii
        from app.db.session import SessionLocal
        
        if not providers:
            providers = list(self.adapters.keys())
            
        saved_jobs = []

        def harvest_provider(provider_name: str) -> list:
            adapter = self.adapters.get(provider_name.lower())
            if not adapter:
                return []
            
            thread_db = SessionLocal()
            thread_saved = []
            try:
                logger.info(f"Fast parallel search on {provider_name} for '{query}' in '{location}'...")
                raw_jobs = adapter.search_jobs(thread_db, user_id, query, location)
                
                for raw_job in raw_jobs:
                    normalized = adapter.normalize_job(raw_job)
                    
                    # Strictly filter for IT / Tech / Software roles only
                    title_str = (normalized.get("title") or "").lower()
                    desc_str = (normalized.get("description") or "").lower()
                    
                    non_it_terms = [
                        "bpo", "voice process", "non voice", "customer care", "customer support",
                        "telecaller", "telesales", "xray", "x-ray", "dialysis", "technician", "nurse",
                        "doctor", "counsellor", "counselor", "construction", "carpenter", "driver",
                        "delivery", "ca finalist", "ca final", "chartered accountant", "store in-charge",
                        "storekeeper", "recruiter", "talent acquisition", "hr executive", "screener",
                        "ardm", "rdm", "insurance", "banking process", "language specialist",
                        "domestic technical troubleshooting", "maintenance operative", "account manager"
                    ]
                    if any(bad in title_str for bad in non_it_terms):
                        continue

                    it_terms = [
                        "software", "developer", "engineer", "python", "java", "frontend", "backend",
                        "full stack", "fullstack", "data", "analyst", "cloud", "devops", "qa", "tester",
                        "sdet", "ai", "ml", "machine learning", "cyber", "security", "system", "architect",
                        "react", "node", "javascript", "typescript", "golang", "c++", "c#", ".net",
                        "api", "database", "sql", "web", "ui", "ux", "mobile", "android", "ios",
                        "automation", "tech", "platform", "robotics", "intern"
                    ]
                    if not any(k in title_str or k in desc_str for k in it_terms):
                        continue

                    # Robust Deduplication check (URL, job_id, and Company + Title case-insensitive)
                    clean_comp = (normalized.get("company") or "").strip()
                    clean_title = (normalized.get("title") or "").strip()
                    clean_url_base = (normalized.get("url") or "").split("?")[0].rstrip("/")

                    existing_job = thread_db.query(Job).filter(
                        (Job.job_id == normalized["job_id"]) | 
                        (Job.url == normalized["url"]) | 
                        (Job.url.ilike(f"{clean_url_base}%")) |
                        ((Job.company.ilike(clean_comp)) & (Job.title.ilike(clean_title)))
                    ).first()
                    
                    if existing_job:
                        if save_to_db:
                            thread_saved.append(existing_job.id)
                        else:
                            thread_saved.append(job_to_dict(existing_job))
                        continue
                        
                    if save_to_db:
                        # Save Job record instantly to DB
                        job = Job(
                            job_id=normalized["job_id"],
                            title=normalized["title"],
                            company=normalized["company"],
                            location=normalized["location"],
                            salary=normalized["salary"],
                            experience=normalized["experience"],
                            description=normalized["description"],
                            url=normalized["url"],
                            source=normalized["source"],
                            posted_date=normalized["posted_date"]
                        )
                        thread_db.add(job)
                        thread_db.flush()
                        
                        # Save JobSkills
                        for skill_name in normalized.get("skills", []):
                            job_skill = JobSkill(job_id=job.id, name=skill_name)
                            thread_db.add(job_skill)
                        
                        thread_db.commit()
                        thread_saved.append(job.id)
                    else:
                        transient_id = binascii.crc32(normalized["job_id"].encode('utf-8')) & 0x7fffffff
                        job_dict = {
                            "id": transient_id,
                            "job_id": normalized["job_id"],
                            "title": normalized["title"],
                            "company": normalized["company"],
                            "location": normalized.get("location"),
                            "salary": normalized.get("salary"),
                            "experience": normalized.get("experience"),
                            "description": normalized.get("description"),
                            "url": normalized.get("url"),
                            "source": normalized["source"],
                            "posted_date": normalized["posted_date"],
                            "created_at": datetime.datetime.utcnow(),
                            "skills": [{"id": idx, "name": sk} for idx, sk in enumerate(normalized.get("skills", []))]
                        }
                        thread_saved.append(job_dict)
            except Exception as e:
                thread_db.rollback()
                logger.error(f"Error harvesting jobs from {provider_name}: {e}")
            finally:
                thread_db.close()
            return thread_saved

        # Execute providers sequentially to prevent high CPU / overheating
        for prov in providers:
            try:
                results = harvest_provider(prov)
                if results:
                    if save_to_db:
                        found_jobs = db.query(Job).filter(Job.id.in_(results)).all()
                        saved_jobs.extend(found_jobs)
                    else:
                        saved_jobs.extend(results)
            except Exception as ex:
                logger.warning(f"Provider task error for {prov.source_name}: {ex}")

        return saved_jobs

job_discovery_service = JobDiscoveryService()
