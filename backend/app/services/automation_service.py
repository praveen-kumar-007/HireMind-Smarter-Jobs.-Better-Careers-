import os
import sys
import re
import time
import json
import socket
import subprocess
import urllib.request
from urllib.parse import urlparse
from datetime import datetime
import logging
from typing import Any
try:
    from playwright.sync_api import sync_playwright, Page  # type: ignore
except ImportError:
    sync_playwright = None  # type: ignore
    Page = Any  # type: ignore
from sqlalchemy.orm import Session
from app.models.application import Application, ApplicationEvent, AuditLog, ApplicationAnswer
from app.models.job import Job, JobSkill, JobMatch
from app.models.resume import ResumeVersion
from app.models.user import UserPlatformCredential, User
from app.services.ai_service import ai_service
from app.services.email_service import email_verification_service
from app.core.config import settings

logger = logging.getLogger(__name__)

class BrowserManager:
    """Manages browser sessions, real-time application steps, and safe auto-applies."""
    def __init__(self):
        self.headless = settings.PLAYWRIGHT_HEADLESS

    def log_event(self, db: Session, app_id: int, step: str, progress: int, status_text: str, is_error: bool = False):
        """Log real-time application step for SSE streams and auditing with resilient error handling."""
        for attempt in range(3):
            try:
                event = ApplicationEvent(
                    application_id=app_id,
                    step=step,
                    progress=progress,
                    status_text=status_text,
                    is_error=is_error
                )
                db.add(event)

                app = db.query(Application).filter(Application.id == app_id).first()
                if app:
                    audit = AuditLog(
                        user_id=app.user_id,
                        event=step,
                        details=status_text
                    )
                    db.add(audit)
                db.commit()
                break
            except Exception as e:
                logger.warning(f"Error logging event (attempt {attempt+1}): {e}")
                db.rollback()
                time.sleep(0.3)

    def _human_type(self, locator, text: str, page: Page):
        """Types text like a real human with natural pace."""
        try:
            locator.scroll_into_view_if_needed()
            page.wait_for_timeout(150)
            locator.click()
            page.wait_for_timeout(100)
            if len(text) > 40:
                locator.fill(text)
            else:
                locator.press_sequentially(text, delay=25)
        except Exception:
            try:
                locator.fill(text)
            except Exception:
                pass

    def _human_click(self, locator, page: Page):
        """Scrolls into view, hovers, and clicks. Bypasses standard pointer issues using JS evaluation if standard click is blocked."""
        try:
            locator.scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            locator.hover()
            page.wait_for_timeout(150)
            locator.click(timeout=3000)
        except Exception:
            try:
                locator.click(timeout=1500)
            except Exception:
                try:
                    locator.evaluate("node => node.click()")
                except Exception:
                    pass

    def _launch_browser_context(self, p, profile_dir: str, headless: bool):
        """Launches actual Google Chrome browser, connects to an existing Chrome via CDP, or launches headless Chromium in cloud/Linux."""
        is_windows = sys.platform == "win32"
        effective_headless = True if not is_windows else headless

        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-infobars"
        ]

        # 1. Try connecting to an existing Chrome browser instance via CDP (Local Windows development)
        if is_windows:
            try:
                import socket
                import urllib.request
                from urllib.parse import urlparse
                
                parsed_url = urlparse(settings.CHROME_CDP_URL)
                host = parsed_url.hostname or "127.0.0.1"
                port = parsed_url.port or 9222
                
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(0.5)
                    s.connect((host, port))
                    
                cdp_version_url = f"{settings.CHROME_CDP_URL}/json/version" if not settings.CHROME_CDP_URL.endswith('/json/version') else settings.CHROME_CDP_URL
                with urllib.request.urlopen(cdp_version_url, timeout=0.6) as response:
                    if response.status == 200:
                        logger.info(f"Found running Chrome instance on {settings.CHROME_CDP_URL}. Connecting via CDP...")
                        browser = p.chromium.connect_over_cdp(settings.CHROME_CDP_URL)
                        if browser.contexts:
                            context = browser.contexts[0]
                            context.close = lambda: logger.info("CDP session close requested - keeping user's Chrome open.")
                            context._cdp_browser = browser
                            return context
                        else:
                            context = browser.new_context()
                            context._cdp_browser = browser
                            return context
            except Exception:
                logger.info("Chrome CDP port not active. Proceeding with browser launch...")

            # 2. Try launching Windows Chrome directly if available
            chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            if not os.path.exists(chrome_exe):
                chrome_exe = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

            debug_profile_dir = r"C:\chrome-debug"
            if os.path.exists(chrome_exe) and os.path.exists(debug_profile_dir):
                try:
                    logger.info(f"Directly launching Chrome with C:\\chrome-debug profile...")
                    context = p.chromium.launch_persistent_context(
                        user_data_dir=debug_profile_dir,
                        executable_path=chrome_exe,
                        channel="chrome",
                        headless=effective_headless,
                        slow_mo=100 if not effective_headless else None,
                        args=launch_args
                    )
                    return context
                except Exception as e_direct:
                    logger.warning(f"Could not directly open C:\\chrome-debug profile: {e_direct}")

        # 3. Cloud / Standard Chromium Launch (Always succeeds in headless Linux / Render / Docker)
        try:
            browser = p.chromium.launch(
                headless=effective_headless,
                slow_mo=100 if (not effective_headless and is_windows) else None,
                args=launch_args
            )
            return browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        except Exception as e_launch:
            # If Playwright browser binaries are missing in Linux container, auto-install and retry
            logger.warning(f"Chromium launch error: {e_launch}. Attempting auto-install of Playwright Chromium...")
            try:
                import subprocess
                subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
                browser = p.chromium.launch(headless=True, args=launch_args)
                return browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                )
            except Exception as e_retry:
                raise ConnectionError(f"Cloud Browser Automation failed to launch Chromium: {e_retry}")

    def generate_tailored_pdf_in_page(self, page: Page, app: Application, resume_data: dict, db: Session) -> str:
        """Tailors career objective and skills matching the job using AI, then renders to PDF in current browser."""
        self.log_event(db, app.id, "Tailoring Resume", 20, "Analyzing job requirements to tailor resume summary...")
        
        job_title = app.job.title
        job_desc = app.job.description or ""
        
        objective = "A passionate and self-driven software developer dedicated to building high-performance scalable systems."
        skills_str = "Python, FastAPI, SQL, React, Node.js, Machine Learning, Docker, Git, REST APIs, Problem-Solving"
        
        # Fast AI customization
        try:
            prompt = f"""Write a 2-sentence career objective tailored to: Title: {job_title}, Desc: {job_desc[:800]}. Return ONLY valid JSON: {{"objective": "...", "skills": "..."}}"""
            res = ai_service.ask_ai(prompt, task_type="extraction", timeout_override=6).strip()
            import json, re
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match:
                tailor_data = json.loads(match.group(0))
                objective = tailor_data.get("objective", objective)
                skills_str = tailor_data.get("skills", skills_str)
        except Exception as e:
            logger.debug(f"Fast AI resume tailoring skipped/timed out: {e}")

        # Locate template HTML in workspace
        html_path = os.path.abspath("Resume Praveen Kumar.html")
        if not os.path.exists(html_path):
            html_path = os.path.abspath("../Resume Praveen Kumar.html")
        
        if os.path.exists(html_path):
            with open(html_path, "r", encoding="utf-8") as f:
                html_content = f.read()

            import re
            html_content = re.sub(r'(<h3>Career Objective</h3>\s*<p>\s*).*?(\s*</p>)', rf'\1{objective}\2', html_content, flags=re.DOTALL)
            html_content = re.sub(r'(<p class="skills-inline">\s*Skills:\s*).*?(\s*</p>)', rf'\1{skills_str}\2', html_content, flags=re.DOTALL)
        else:
            html_content = f"<html><body><h1>{resume_data.get('name', 'Applicant')}</h1><p>{objective}</p><p>Skills: {skills_str}</p></body></html>"

        os.makedirs("app/static/resumes", exist_ok=True)
        pdf_filename = f"resume_app_{app.id}.pdf"
        pdf_path = os.path.abspath(os.path.join("app/static/resumes", pdf_filename))

        # Render PDF using a temporary headless browser session (since page.pdf() is not supported in headed/CDP mode)
        with sync_playwright() as p:
            temp_browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
            )
            temp_page = temp_browser.new_page()
            temp_page.set_content(html_content, wait_until="load")
            temp_page.add_style_tag(content='#download-btn { display: none !important; } .download-btn-wrapper { display: none !important; }')
            temp_page.pdf(
                path=pdf_path,
                format="A4",
                print_background=True,
                margin={"top": "0px", "right": "0px", "bottom": "0px", "left": "0px"}
            )
            temp_browser.close()
        return pdf_path

    def fill_and_apply(self, application_id: int, db: Session) -> dict:
        """Runs the multi-step browser automation agent with real-time SSE telemetry."""
        app = db.query(Application).filter(Application.id == application_id).first()
        if not app:
            return {"status": "error", "message": "Application not found"}

        # Reset old events
        try:
            db.query(ApplicationEvent).filter(ApplicationEvent.application_id == application_id).delete()
            db.commit()
        except Exception:
            db.rollback()

        # Step 1: Initializing
        self.log_event(db, application_id, "Initializing", 2, "Checking candidate database records...")
        self.log_event(db, application_id, "Initializing", 5, "Verifying job details and requirements...")
        
        platform_name = (app.job.source or "web").lower().strip()
        # If it is a company website manual apply, do not run Playwright. Bypass it immediately!
        if "company website" in platform_name or "companywebsite" in platform_name or platform_name not in ["naukri", "indeed", "linkedin"]:
            app.status = "Manual Intervention"
            app.notes = "Company Website - Manual Apply"
            self.log_event(db, application_id, "Manual Intervention", 100, f"Job at {app.job.company} requires manual application on the company's website. Listed under Manual Intervention.")
            db.commit()
            return {"status": "manual_apply_required", "message": "Company website application requires manual intervention."}

        self.log_event(db, application_id, "Initializing", 8, "Validating candidate fields...")
        # Fetch candidate profile details
        user = db.query(User).filter(User.id == app.user_id).first()
        profile = user.profile if user else None
        test_mode = profile.test_mode if profile else False
        headless_mode = settings.PLAYWRIGHT_HEADLESS

        # Fetch latest resume parsed data
        resume_version = db.query(ResumeVersion).order_by(ResumeVersion.id.desc()).first()
        resume_data = resume_version.parsed_data if resume_version and resume_version.parsed_data else {
            "name": profile.full_name if profile and profile.full_name else "Praveen Kumar",
            "email": user.email if user else "praveen.pr105@gmail.com",
            "phone": profile.phone if profile and profile.phone else "+91 9504904499",
            "location": profile.location if profile and profile.location else "Dhanbad, India",
            "skills": ["Python", "FastAPI", "React", "SQL", "Machine Learning"]
        }

        self.log_event(db, application_id, "Initializing", 12, "Retrieving platform credentials...")
        # Fetch credentials for the specific platform
        cred = db.query(UserPlatformCredential).filter(
            UserPlatformCredential.user_id == app.user_id,
            UserPlatformCredential.platform == platform_name,
            UserPlatformCredential.is_active == True
        ).first()

        try:
            with sync_playwright() as p:
                self.log_event(db, application_id, "Launching Browser", 16, "Opening Google Chrome desktop browser window...")
                
                profile_dir = os.path.abspath("app/static/browser_profile_apply")
                os.makedirs(profile_dir, exist_ok=True)
                
                context = self._launch_browser_context(p, profile_dir, headless=headless_mode)
                
                # If using existing Chrome (CDP), always open a new tab to avoid overwriting or detaching user's active tab
                if hasattr(context, "_cdp_browser"):
                    self.log_event(db, application_id, "Launching Browser", 20, "Connecting to running Chrome instance via CDP...")
                    self.log_event(db, application_id, "Launching Browser", 24, "Opening new automated tab...")
                    page = context.new_page()
                else:
                    self.log_event(db, application_id, "Launching Browser", 20, "Creating fresh browser context...")
                    self.log_event(db, application_id, "Launching Browser", 24, "Opening automated page...")
                    page = context.pages[0] if hasattr(context, "pages") and context.pages else context.new_page()

                # Generate tailored PDF or use static resume
                tailor_resume = getattr(settings, "TAILOR_RESUME", False)
                if tailor_resume:
                    self.log_event(db, application_id, "AI Tailoring", 28, "Analyzing job description for skill alignment...")
                    self.log_event(db, application_id, "AI Tailoring", 32, "Synthesizing tailored career objective...")
                    self.log_event(db, application_id, "AI Tailoring", 36, "Compiling customized skills list...")
                    self.log_event(db, application_id, "Tailoring Resume", 40, f"Generating tailored PDF resume for {app.job.title}...")
                    
                    try:
                        resume_file_path = self.generate_tailored_pdf_in_page(page, app, resume_data, db)
                    except Exception as pdf_err:
                        logger.warning(f"PDF tailoring error ({pdf_err}), using static path")
                        resume_file_path = "Praveen_Resume.pdf"
                else:
                    self.log_event(db, application_id, "Tailoring Resume", 40, "Using static resume (TAILOR_RESUME=false)...")
                    # Locate pre-compiled static resume
                    resume_file_path = "Praveen_Resume.pdf"
                    for path_cand in ["Praveen_Resume.pdf", "../Praveen_Resume.pdf", "resume.pdf", "../resume.pdf"]:
                        abs_p = os.path.abspath(path_cand)
                        if os.path.exists(abs_p):
                            resume_file_path = abs_p
                            break

                # Router matching platform-specific workflows
                result = None
                if "naukri" in platform_name:
                    result = self.apply_naukri(page, cred, resume_data, resume_file_path, db, app, test_mode)
                elif "indeed" in platform_name:
                    result = self.apply_indeed(page, cred, resume_data, resume_file_path, db, app, test_mode)
                elif "linkedin" in platform_name:
                    result = self.apply_linkedin(page, cred, resume_data, resume_file_path, db, app, test_mode)
                else:
                    result = self.apply_fallback(page, resume_data, resume_file_path, app.job.url, db, app, test_mode)

                # Save resulting status
                if result and result.get("status") == "success":
                    time.sleep(1.0)
                    if test_mode:
                        app.status = "Ready"
                        app.notes = "Quick Applied (Test Mode)"
                        self.log_event(db, application_id, "Prepared", 100, f"Forms pre-filled successfully for {app.job.title}! [Review Mode]")
                    else:
                        app.status = "Applied"
                        app.notes = "Quick Applied"
                        self.log_event(db, application_id, "Completed", 100, f"Auto-applied successfully to {app.job.title} at {app.job.company}!")
                        # Auto-queue for outreach mail
                        self._auto_queue_outreach(db, app)
                elif result and result.get("status") == "manual_apply_required":
                    app.status = "Manual Intervention"
                    app.notes = "Company Website - Manual Apply"
                    self.log_event(db, application_id, "Company Website", 100, result.get("message", f"Job at {app.job.company} requires applying directly on company website. Saved for manual entry."))
                    # Still queue for outreach mail so recruiter gets notified
                    self._auto_queue_outreach(db, app)
                elif result and result.get("status") == "human_action_required":
                    app.status = "Review Required"
                    self.log_event(db, application_id, "Awaiting Human", 75, f"Authentication block or CAPTCHA detected on {app.job.source}. Saved for review.")
                else:
                    app.status = "Failed"
                    self.log_event(db, application_id, "Failed", 100, f"Application halted: {result.get('message') if result else 'Unknown error'}", is_error=True)

                db.commit()
                try:
                    if hasattr(context, "_cdp_browser"):
                        page.close()
                    else:
                        context.close()
                except Exception:
                    pass
                return result or {"status": "error", "message": "Execution returned empty result"}

        except Exception as e:
            logger.error(f"Playwright agent crashed: {e}")
            try:
                if 'page' in locals() and not page.is_closed():
                    page.close()
            except Exception:
                pass
            try:
                if 'context' in locals() and not hasattr(context, "_cdp_browser"):
                    context.close()
            except Exception:
                pass
            app.status = "Failed"
            self.log_event(db, application_id, "Error", 100, f"Browser automation error: {str(e)}", is_error=True)
            db.commit()
            return {"status": "error", "message": f"Browser automation error: {str(e)}"}

    def verify_candidate_fields(self, resume_data: dict) -> dict:
        """ApplicationVerificationAgent check."""
        errors = []
        warnings = []
        if not resume_data.get("name"):
            errors.append("Full name is missing")
        if not resume_data.get("email"):
            errors.append("Email address is missing")
        if not resume_data.get("phone"):
            errors.append("Contact phone number is missing")
        return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}

    def _auto_queue_outreach(self, db: Session, app: Application):
        """After a successful Quick Apply, auto-queue the application for recruiter outreach mail."""
        try:
            if not app.notes:
                app.notes = "Quick Applied"
            elif "Outreach" not in app.notes:
                app.notes = f"{app.notes} | Outreach Email Queued"
            
            audit = AuditLog(
                user_id=app.user_id,
                event="Auto-Queued for Outreach",
                details=f"Quick Applied to {app.job.title} at {app.job.company}. Auto-queued for recruiter outreach mail."
            )
            db.add(audit)
            db.commit()
            logger.info(f"Auto-queued application {app.id} for outreach after Quick Apply.")
        except Exception as e:
            logger.warning(f"Failed to auto-queue outreach for app {app.id}: {e}")

    def apply_naukri(self, page: Page, cred: UserPlatformCredential, resume_data: dict, resume_file_path: str, db: Session, app: Application, test_mode: bool) -> dict:
        """Autologin and application workflow for Naukri."""
        # Dialog interception
        def handle_dialog(dialog):
            logger.warning(f"[Playwright Naukri Agent] Intercepted browser popup/alert: '{dialog.message}'")
            self.log_event(db, app.id, "Browser Alert Intercepted", 70, f"Page Alert: '{dialog.message}'. Automatically dismissing to proceed...")
            dialog.dismiss()
        page.on("dialog", handle_dialog)

        self.log_event(db, app.id, "Authenticating", 45, "Connecting to Naukri authentication gateway...")
        
        if cred:
            page.goto("https://www.naukri.com/mnjuser/homepage", wait_until="load")
            page.wait_for_timeout(500)
            
            # Check if already logged in (session active)
            current_url = page.url.lower()
            is_logged_in = "login" not in current_url and ("homepage" in current_url or "dashboard" in current_url or "mynaukri" in current_url)
            
            if is_logged_in:
                self.log_event(db, app.id, "Authenticated", 52, "Active Naukri session detected. Skipping login...")
            else:
                # Need to login
                page.goto("https://www.naukri.com/nlogin/login", wait_until="load")
                page.wait_for_timeout(500)
                
                if "login" in page.url:
                    self.log_event(db, app.id, "Entering Credentials", 52, "Entering Naukri credentials with human keystrokes...")
                    page.wait_for_selector("input#usernameField", timeout=15000)
                    page.fill("input#usernameField", cred.username)
                    page.wait_for_selector("input#passwordField", timeout=15000)
                    page.fill("input#passwordField", cred.password)
                    page.click("button[type='submit']")
                    page.wait_for_timeout(1000)
                else:
                    self.log_event(db, app.id, "Authenticated", 52, "Active Naukri session detected after redirect. Continuing...")
            
            # Check for OTP Verification Screen
            if "otp" in page.url.lower() or page.locator("input[placeholder*='OTP']").is_visible():
                self.log_event(db, app.id, "OTP Challenge", 55, "Naukri OTP challenge detected! Polling your email...")
                page.wait_for_timeout(8000)
                otp_code = email_verification_service.fetch_latest_otp(db, app.user_id, "Naukri")
                
                if otp_code:
                    self.log_event(db, app.id, "Filling OTP", 58, f"Entering verification code: {otp_code}")
                    page.fill("input[placeholder*='OTP']", otp_code)
                    page.click("button:has-text('Verify')")
                    page.wait_for_timeout(800)
                else:
                    return {"status": "human_action_required", "message": "Naukri OTP code not found in email inbox."}
        else:
            self.log_event(db, app.id, "Session Ready", 52, "Proceeding with direct candidate application session...")

        # Navigate to Job Listing
        self.log_event(db, app.id, "Opening Job Listing", 62, f"Navigating to job listing: {app.job.title}...")
        page.goto(app.job.url, wait_until="load")
        page.wait_for_timeout(800)

        # Read the full page to detect state
        page_text = page.inner_text("body").lower() if page.locator("body").count() > 0 else ""

        # Check if job is expired or no longer available
        is_expired = False
        expired_patterns = [
            "job you are looking for is expired",
            "this job has expired",
            "job has expired",
            "no longer accepting applications",
            "this vacancy is no longer available",
            "job is no longer available",
            "the job you are looking for is no longer available",
            "the job you're looking for is no longer available",
            "job not found",
            "no longer available",
            "job is closed"
        ]

        for pat in expired_patterns:
            if pat in page_text:
                is_expired = True
                break

        if is_expired:
            self.log_event(db, app.id, "Job Expired", 100, f"Listing for '{app.job.title}' at {app.job.company} is expired on Naukri. Erasing from job board.")
            try:
                app_job_id = app.job.id if app.job else None
                app.status = "Dismissed"
                db.commit()
                if app_job_id:
                    db.query(JobMatch).filter(JobMatch.job_id == app_job_id).delete()
                    db.query(JobSkill).filter(JobSkill.job_id == app_job_id).delete()
                    db.query(Job).filter(Job.id == app_job_id).delete()
                    db.commit()
            except Exception as del_err:
                logger.warning(f"Error erasing expired job: {del_err}")
                db.rollback()
            return {"status": "expired", "message": f"Job '{app.job.title}' is expired on Naukri. Erased from job board."}

        # Proceed to fill and submit the Naukri application
        return self._apply_naukri(page, cred, resume_data, resume_file_path, db, app, test_mode)

    def _is_naukri_already_applied(self, page: Page) -> bool:
        """Thoroughly checks all indicators to verify if an application on Naukri is already completed."""
        try:
            # 1. Check all open pages in the browser context (e.g. if an 'Apply Confirmation' tab/popup opened)
            if page.context:
                for p in page.context.pages:
                    try:
                        p_title = (p.title() or "").lower()
                        p_url = (p.url or "").lower()
                        if "apply confirmation" in p_title or "confirmation" in p_title or "myapply" in p_url or "showacp" in p_url:
                            return True
                        if "success" in p_url or "applied" in p_url:
                            return True
                    except Exception:
                        pass

            # 2. Check main page URL
            p_url = (page.url or "").lower()
            if any(k in p_url for k in ["myapply", "showacp", "success", "confirmation"]):
                return True

            # 3. Check if the Apply button changed to "Applied"
            apply_btns = page.locator("button:has-text('Applied'), a:has-text('Applied'), button#apply-button, button.apply-button, .apply-button, [class*='applied'], .applied-btn")
            for idx in range(min(apply_btns.count(), 10)):
                try:
                    txt = (apply_btns.nth(idx).inner_text() or "").strip().lower()
                    if txt == "applied" or "already applied" in txt:
                        return True
                except Exception:
                    pass

            # 4. Check for text badge /^Applied$/
            if page.locator("text=/^Applied$/").count() > 0:
                return True

            # 5. Check page body text for confirmation messages
            if page.locator("body").count() > 0:
                body_txt = (page.inner_text("body") or "").lower()
                if any(msg in body_txt for msg in [
                    "application submitted", "successfully applied", "already applied", 
                    "applied on", "application sent", "thank you for applying", "your application has been sent",
                    "application received"
                ]):
                    return True

        except Exception as e:
            logger.warning(f"Error checking Naukri applied status: {e}")
        return False

    def _apply_naukri(self, page: Page, cred: UserPlatformCredential, resume_data: dict, resume_file_path: str, db: Session, app: Application, test_mode: bool) -> dict:
        # Check if already applied before doing anything
        if self._is_naukri_already_applied(page):
            self.log_event(db, app.id, "Already Applied", 100, f"Verified: You have already applied to '{app.job.title}' at {app.job.company}. Marking as Applied.")
            return {"status": "success", "message": "Already applied to this role."}

        # Check if listing redirects to external company website
        company_site_btn = page.locator("button:has-text('Apply on company site'), a:has-text('Apply on company site'), button:has-text('Apply on Company Site'), a:has-text('Apply on Company Site')")
        if company_site_btn.count() > 0 and company_site_btn.first.is_visible():
            self.log_event(db, app.id, "Company Website Detected", 100, f"Naukri listing for {app.job.title} requires applying on company website. Left for manual application as requested.")
            return {
                "status": "manual_apply_required",
                "message": f"Naukri job '{app.job.title}' requires applying directly on {app.job.company}'s website. Left for manual application."
            }

        # Try clicking the Apply / Quick Apply / I am interested button
        apply_selectors = [
            'button:has-text("I am interested")',
            'button:has-text("I\'m interested")',
            'button:has-text("Interested")',
            'a:has-text("I am interested")',
            'a:has-text("I\'m interested")',
            'a:has-text("Interested")',
            'button:has-text("Quick Apply")',
            'button:has-text("Apply")',
            'a:has-text("Quick Apply")',
            'a:has-text("Apply")',
            ".apply-button",
            ".quick-apply",
            "button#apply-button",
            "a[class*='apply']",
            "button[class*='apply']"
        ]

        clicked = False
        for sel in apply_selectors:
            try:
                loc = page.locator(sel)
                if loc.count() > 0 and loc.first.is_visible():
                    btn_text = (loc.first.inner_text() or "").strip()
                    btn_lower = btn_text.lower()
                    # Skip if this button says "apply on company site"
                    if "company site" in btn_lower or "company website" in btn_lower:
                        continue
                    # Skip if button text is exactly "Applied" — means already applied on Naukri
                    if btn_text == "Applied":
                        self.log_event(db, app.id, "Already Applied", 100, f"Apply button shows 'Applied' — you already applied to '{app.job.title}'. Marking as Applied.")
                        return {"status": "success", "message": "Already applied to this role (button shows Applied)."}
                    # Skip Save buttons
                    if btn_text == "Save" or btn_text == "Saved":
                        continue
                    try:
                        self.log_event(db, app.id, "Clicking Apply", 72, f"Clicking '{loc.first.inner_text().strip()}' button on {app.job.company}...")
                        self._human_click(loc.first, page)
                        page.wait_for_timeout(600)
                        clicked = True
                        break
                    except Exception:
                        pass
            except Exception as sel_err:
                logger.warning(f"Error checking apply selector '{sel}': {sel_err}")

        if not clicked:
            self.log_event(db, app.id, "No Apply Button", 100, f"Could not find a clickable Apply button on the page for {app.job.title}. Saving for manual review.")
            return {"status": "manual_apply_required", "message": f"No Apply button found for '{app.job.title}'. Left for manual application."}

        # After clicking apply, wait 5 seconds for page response / modal to load
        self.log_event(db, app.id, "Waiting for Form", 75, "Waiting 5 seconds for page response / screening questions...")
        page.wait_for_timeout(5000)

        # 1. IMMEDIATE CONFIRMATION CHECK: If 1-Click applied without screening questions, complete immediately!
        if self._is_naukri_already_applied(page):
            self.log_event(db, app.id, "Applied", 100, f"Application confirmed! 1-Click Apply completed for '{app.job.title}' on {app.job.company}.")
            return {"status": "success", "message": "Successfully Applied"}

        # 2. Handle Naukri Chatbot Questionnaire Drawer if present and active
        has_questions = self._handle_naukri_chatbot_and_questions(page, resume_data, db, app)

        if self._is_naukri_already_applied(page):
            self.log_event(db, app.id, "Applied", 100, f"Application confirmed! Questions answered & submitted for '{app.job.title}' on {app.job.company}.")
            return {"status": "success", "message": "Application submitted and confirmed!"}

        # 3. Handle standard multi-step questionnaires or document upload forms
        for step in range(4):
            if self._is_naukri_already_applied(page):
                break

            self.log_event(db, app.id, "Filling Fields", min(78 + (step * 5), 94), f"Scanning and auto-filling form fields (Step {step+1})...")
            self.auto_fill_visible_inputs(page, resume_data, resume_file_path, db, app)
            
            # Check for final submit / save button
            submit_btn = page.locator("button:has-text('Submit'), button:has-text('Save'), button:has-text('Apply Now'), button:has-text('Send Application'), button:has-text('Submit Application'), button.submit-btn, [class*='submitBtn']")
            if submit_btn.count() > 0 and submit_btn.first.is_visible():
                btn_txt = submit_btn.first.inner_text().strip().lower()
                if btn_txt in ["submit", "save", "apply now", "send application", "submit application"]:
                    if test_mode:
                        return {"status": "success", "message": "Test Mode: Application form inspected and pre-filled."}
                    self.log_event(db, app.id, "Finalizing Submission", 96, f"Clicking {submit_btn.first.inner_text().strip()} button...")
                    submit_btn.first.click()
                    page.wait_for_timeout(2000)
                    break

            # Check for next/continue button to advance the form
            next_btn = page.locator("button:has-text('Next'), button:has-text('Continue'), button:has-text('Save & Continue'), button:has-text('Proceed')")
            if next_btn.count() > 0 and next_btn.first.is_visible():
                self.log_event(db, app.id, "Advancing Form", 85, "Clicking next/continue button to proceed...")
                next_btn.first.click()
                page.wait_for_timeout(1500)
            else:
                break

        # 4. Strict Application Confirmation Check
        page.wait_for_timeout(2000)
        if self._is_naukri_already_applied(page):
            self.log_event(db, app.id, "Applied", 100, f"Application confirmed! Apply button shows Applied on {app.job.company}.")
            return {"status": "success", "message": "Application submitted and confirmed!"}
        
        self.log_event(db, app.id, "Human Review Required", 90, f"Screening questions processed. Please check the open Naukri tab to verify.")
        return {"status": "human_action_required", "message": "Form answered. Please check the open Chrome tab to confirm submission."}

    def _handle_naukri_chatbot_and_questions(self, page: Page, resume_data: dict, db: Session, app: Application) -> bool:
        """Interactively answers Naukri Campus chatbot questions, typing responses and clicking Save.
        Returns True if questions were handled, False if no questions existed."""
        try:
            # 1. If already applied, exit immediately!
            if self._is_naukri_already_applied(page):
                return False

            # 2. Check if a REAL active drawer/modal is present on screen
            has_real_drawer = page.evaluate("""() => {
                const drawer = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"][class*="open"], div[class*="drawer"][class*="visible"], div[class*="drawer"][class*="active"]');
                if (!drawer) return false;
                const r = drawer.getBoundingClientRect();
                const style = window.getComputedStyle(drawer);
                return r.width > 150 && r.height > 150 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }""")

            if not has_real_drawer:
                return False

            # 3. Check if there are active inputs or options strictly INSIDE the drawer
            has_drawer_inputs = page.evaluate("""() => {
                const drawer = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"][class*="open"], div[class*="drawer"][class*="visible"], div[class*="drawer"][class*="active"]');
                if (!drawer) return false;
                const inputs = drawer.querySelectorAll('input[type="text"], input:not([type]), input[type="radio"], textarea, div[contenteditable="true"], button[class*="chip"], [class*="option"]');
                return Array.from(inputs).some(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                });
            }""")

            if not has_drawer_inputs:
                return False

            self.log_event(db, app.id, "Screening Bot Detected", 80, "Naukri screening questionnaire detected. Answering questions...")
            profile = app.user.profile if app and app.user else None

            # Process up to 8 interaction turns
            for turn in range(8):
                if self._is_naukri_already_applied(page):
                    return True

                page.wait_for_timeout(1200)

                # Check if drawer inputs are still active
                drawer_state = page.evaluate("""() => {
                    const drawer = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"][class*="open"], div[class*="drawer"][class*="visible"], div[class*="drawer"][class*="active"]');
                    if (!drawer) return { hasInputs: false, hasRadio: false, qText: '' };
                    
                    const textInputs = Array.from(drawer.querySelectorAll('input[type="text"], input:not([type]), textarea, div[contenteditable="true"], [role="textbox"]')).filter(el => {
                        const r = el.getBoundingClientRect();
                        return r.width > 0 && r.height > 0;
                    });

                    const radioItems = Array.from(drawer.querySelectorAll('input[type="radio"], label, [class*="radio"], [class*="option"], button[class*="chip"]')).filter(el => {
                        const r = el.getBoundingClientRect();
                        const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                        return r.width > 0 && r.height > 0 && (txt.includes('yes') || txt.includes('no') || txt.includes('skip') || el.type === 'radio');
                    });

                    // Extract question text strictly from within drawer messages, skipping non-question footer/header strings
                    const msgs = Array.from(drawer.querySelectorAll('p, div, span, h2, h3, h4, h5')).filter(el => {
                        const t = (el.innerText || el.textContent || '').trim();
                        const tLower = t.toLowerCase();
                        if (t.length < 5 || t.length > 250) return false;
                        if (tLower.includes('grievance') || tLower.includes('help center') || tLower.includes('summons') || tLower.includes('terms') || tLower.includes('privacy') || tLower.includes('copyright') || tLower.includes('feedback')) return false;
                        return t.includes('?') || tLower.includes('experience') || tLower.includes('relocate') || tLower.includes('residing') || tLower.includes('ctc') || tLower.includes('salary') || tLower.includes('notice') || tLower.includes('years') || tLower.includes('skill');
                    });

                    const qText = msgs.length > 0 ? (msgs[msgs.length - 1].innerText || msgs[msgs.length - 1].textContent || '').trim() : '';

                    return {
                        hasInputs: textInputs.length > 0,
                        hasRadio: radioItems.length > 0,
                        qText: qText
                    };
                }""")

                if not drawer_state.get("hasInputs") and not drawer_state.get("hasRadio"):
                    # Check for Save/Submit inside drawer
                    page.evaluate("""() => {
                        const drawer = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"]');
                        if (!drawer) return;
                        const btns = Array.from(drawer.querySelectorAll('button, input[type="submit"], a[class*="btn"]'));
                        for (const b of btns) {
                            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
                            if (txt.includes('save') || txt.includes('submit') || txt.includes('apply')) {
                                b.click();
                                break;
                            }
                        }
                    }""")
                    page.wait_for_timeout(2000)
                    break

                q_text = drawer_state.get("qText") or "Screening Question"
                self.log_event(db, app.id, "AI Analyzing Question", min(81 + turn, 88), f"Question ({turn+1}): '{q_text}'")

                # AI Answer Generation
                ai_prompt = f"""You are answering a live job application screening question on behalf of candidate {profile.full_name if profile else 'Praveen Kumar'}.
Target Role: {app.job.title} at {app.job.company}
Candidate Skills: {", ".join(resume_data.get('skills', []))}
Candidate Experience: Full Stack & AI/ML Projects (React, Node, Python, SQL)
Candidate Notice Period: {profile.notice_period if profile and profile.notice_period else 'Immediate / 15 days'}

Question Asked on Form: "{q_text}"

CRITICAL INSTRUCTIONS:
- For experience in any technology or role (e.g. Web Development, AI/ML, Python, React), ALWAYS return at least 1 (e.g. 1 or 2). NEVER answer 0.
- When asked if residing in or willing to relocate to a city (e.g. Ahmedabad, Pune, Bangalore), ALWAYS answer 'Yes'.
- If the question is Yes/No, answer 'Yes' or 'No'.
- If asking for current CTC in Lacs for fresher/entry level, answer 0. If asking for expected CTC in Lacs, answer 3 or 4.
- Return ONLY the exact answer string with no explanation, no quotes, and no prefixes."""

                q_lower = q_text.lower()
                if "relocate" in q_lower or "residing in" in q_lower or "willing to relocate" in q_lower or "location" in q_lower and ("yes" in q_lower or "?" in q_lower):
                    answer = "Yes"
                elif "experience in" in q_lower or "years of experience" in q_lower or "how many years" in q_lower:
                    answer = "1"
                else:
                    try:
                        answer = ai_service.ask_ai(ai_prompt, task_type="fast", timeout_override=5).strip().replace('"', '').replace("'", "")
                        if ("experience" in q_lower or "years" in q_lower) and answer == "0":
                            answer = "1"
                    except Exception as gen_err:
                        logger.warning(f"Live AI answering fallback: {gen_err}")
                        if "current ctc" in q_lower or "current salary" in q_lower:
                            answer = "0"
                        elif "expected ctc" in q_lower or "expected salary" in q_lower:
                            answer = "3"
                        elif "notice" in q_lower or "join" in q_lower:
                            answer = "15 days"
                        else:
                            answer = "Yes"

                self.log_event(db, app.id, "Typing Bot Answer", min(82 + turn, 89), f"AI Answer: '{answer}' for '{q_text[:30]}...'")

                # If Radio options present
                if drawer_state.get("hasRadio"):
                    page.evaluate("""(ans) => {
                        const drawer = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"]');
                        if (!drawer) return false;
                        const items = Array.from(drawer.querySelectorAll('input[type="radio"], label, div[class*="radio"], div[class*="option"], li[class*="option"], button[class*="chip"]')).filter(el => {
                            const r = el.getBoundingClientRect();
                            return r.width > 0 && r.height > 0;
                        });
                        
                        const target = ans.toLowerCase().trim();
                        for (const el of items) {
                            const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                            const val = (el.getAttribute('value') || '').toLowerCase();
                            if (txt === target || val === target || txt.startsWith(target)) {
                                el.click();
                                return true;
                            }
                        }
                        if (target === 'yes') {
                            for (const el of items) {
                                const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                                if (!txt.includes('skip') && !txt.includes('no') && txt.length > 0) {
                                    el.click();
                                    return true;
                                }
                            }
                        }
                        return false;
                    }""", str(answer))
                    self._save_qa(db, app.id, q_text, str(answer))
                    page.wait_for_timeout(1500)

                # If Text inputs present
                elif drawer_state.get("hasInputs"):
                    page.evaluate("""(ans) => {
                        const drawer = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"]');
                        if (!drawer) return;
                        const inputs = Array.from(drawer.querySelectorAll('input[type="text"], input:not([type]), textarea, div[contenteditable="true"], [role="textbox"]')).filter(el => {
                            const r = el.getBoundingClientRect();
                            return r.width > 0 && r.height > 0;
                        });
                        if (inputs.length > 0) {
                            const el = inputs[inputs.length - 1];
                            el.focus();
                            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                                el.value = ans;
                            } else {
                                el.innerText = ans;
                            }
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }""", str(answer))

                    # Send button trigger inside drawer
                    page.evaluate("""() => {
                        const drawer = document.querySelector('.chatbot_Drawer, .chatbot-container, [class*="chatbot_Drawer"], [class*="chatContainer"], [class*="botWrapper"], [role="dialog"], div[class*="drawer"]');
                        if (!drawer) return;
                        const send = drawer.querySelector('button[class*="send"], .send-icon, button:has-text("Send"), .send-btn, button[type="submit"]');
                        if (send) send.click();
                    }""")
                    page.keyboard.press("Enter")
                    self._save_qa(db, app.id, q_text, str(answer))
            return True
        except Exception as bot_err:
            logger.warning(f"Note during chatbot handling: {bot_err}")
            return False

    def apply_indeed(self, page: Page, cred: UserPlatformCredential, resume_data: dict, resume_file_path: str, db: Session, app: Application, test_mode: bool) -> dict:
        def handle_dialog(dialog):
            logger.warning(f"[Playwright Indeed Agent] Intercepted browser popup/alert: '{dialog.message}'")
            self.log_event(db, app.id, "Browser Alert Intercepted", 70, f"Page Alert: '{dialog.message}'. Automatically dismissing to proceed...")
            dialog.dismiss()
        page.on("dialog", handle_dialog)

        self.log_event(db, app.id, "Authenticating", 45, "Navigating to Indeed portal...")
        time.sleep(0.8)
        
        if cred:
            # Check if already logged in
            page.goto("https://www.indeed.com/", wait_until="load")
            page.wait_for_timeout(2000)
            
            # If profile/account link is visible, we're logged in
            is_logged_in = page.locator("a[href*='account'], a[data-gnav-element-name='AccountMenu']").count() > 0
            
            if is_logged_in:
                self.log_event(db, app.id, "Authenticated", 52, "Active Indeed session detected. Skipping login...")
                time.sleep(0.8)
            else:
                page.goto("https://secure.indeed.com/account/login", wait_until="load")
                page.wait_for_selector("input[name='__email']", timeout=15000)
                page.fill("input[name='__email']", cred.username)
                page.click("button[type='submit']")
                page.wait_for_timeout(2000)
                page.wait_for_selector("input[name='__password']", timeout=15000)
                page.fill("input[name='__password']", cred.password)
                page.click("button[type='submit']")
                page.wait_for_timeout(3000)

        self.log_event(db, app.id, "Opening Job Listing", 62, f"Opening Indeed job: {app.job.title}...")
        time.sleep(0.8)
        page.goto(app.job.url, wait_until="load")
        page.wait_for_timeout(2000)

        # Check if listing redirects to external employer site
        company_site_btn = page.locator("button:has-text('Apply on company site'), a:has-text('Apply on company site'), button:has-text('Apply on employer site'), a:has-text('Apply on employer site')")
        if company_site_btn.count() > 0 and company_site_btn.first.is_visible():
            self.log_event(db, app.id, "Company Website Detected", 100, f"Indeed listing for {app.job.title} redirects to external employer website. Left for manual application.")
            return {
                "status": "manual_apply_required",
                "message": f"Indeed job '{app.job.title}' requires applying directly on {app.job.company}'s website. Left for manual application."
            }

        apply_btn = page.locator("button:has-text('Apply Now'), a:has-text('Apply Now'), button:has-text('Apply with Indeed')")
        if apply_btn.count() > 0:
            apply_btn.first.click()
            self.log_event(db, app.id, "Waiting for Form", 75, "Waiting 5 seconds for Indeed questionnaire and form fields to load...")
            page.wait_for_timeout(5000)
            
            # Complete multi-page Easy Apply questionnaire
            max_steps = 8
            for step in range(max_steps):
                pct = 70 + (step * 3)
                self.log_event(db, app.id, "Filling Questionnaire", min(pct, 94), f"Completing questionnaire step {step+1}...")
                time.sleep(0.6)
                
                if page.locator("button:has-text('Submit Application')").is_visible():
                    if test_mode:
                        return {"status": "success", "message": "Test Mode: Halting before final Indeed submission"}
                    page.click("button:has-text('Submit Application')")
                    page.wait_for_timeout(2500)
                    return {"status": "success", "message": "Indeed application submitted"}
                
                self.auto_fill_visible_inputs(page, resume_data, resume_file_path, db, app)
                
                continue_btn = page.locator("button:has-text('Continue'), button:has-text('Next')")
                if continue_btn.is_visible():
                    continue_btn.click()
                    page.wait_for_timeout(2000)
                else:
                    break

            return {"status": "success", "message": "Indeed questionnaire filled"}
        
        return {
            "status": "manual_apply_required",
            "message": f"Indeed job '{app.job.title}' requires manual apply on employer site."
        }

    def apply_linkedin(self, page: Page, cred: UserPlatformCredential, resume_data: dict, resume_file_path: str, db: Session, app: Application, test_mode: bool) -> dict:
        def handle_dialog(dialog):
            logger.warning(f"[Playwright LinkedIn Agent] Intercepted browser popup/alert: '{dialog.message}'")
            self.log_event(db, app.id, "Browser Alert Intercepted", 70, f"Page Alert: '{dialog.message}'. Automatically dismissing to proceed...")
            dialog.dismiss()
        page.on("dialog", handle_dialog)

        self.log_event(db, app.id, "Authenticating", 45, "Connecting to LinkedIn...")
        
        if cred:
            # Check if already logged in by navigating to feed
            page.goto("https://www.linkedin.com/feed/", wait_until="load")
            
            current_url = page.url.lower()
            is_logged_in = "feed" in current_url or "mynetwork" in current_url or "messaging" in current_url
            
            if is_logged_in:
                self.log_event(db, app.id, "Authenticated", 52, "Active LinkedIn session detected. Skipping login...")
            else:
                # Need to login
                page.goto("https://www.linkedin.com/login", wait_until="load")
                
                # Double-check we're actually on login page
                if "login" in page.url.lower():
                    self.log_event(db, app.id, "Entering Credentials", 50, "Entering LinkedIn credentials...")
                    page.wait_for_selector("input#username", timeout=15000)
                    page.fill("input#username", cred.username)
                    page.wait_for_selector("input#password", timeout=15000)
                    page.fill("input#password", cred.password)
                    page.click("button[type='submit']")
                    page.wait_for_timeout(3000)
                    
                    if "checkpoint" in page.url or page.locator("input#input-code").is_visible():
                        self.log_event(db, app.id, "2FA Challenge", 52, "LinkedIn 2FA challenge detected! Polling your email...")
                        page.wait_for_timeout(8000)
                        otp_code = email_verification_service.fetch_latest_otp(db, app.user_id, "LinkedIn")
                        
                        if otp_code:
                            page.fill("input#input-code", otp_code)
                            page.click("button#submit-code")
                            page.wait_for_timeout(3000)
                        else:
                            return {"status": "human_action_required", "message": "LinkedIn 2FA code not found in email."}
                else:
                    self.log_event(db, app.id, "Authenticated", 52, "LinkedIn redirected to feed. Session already active.")

        self.log_event(db, app.id, "Opening Job Listing", 62, f"Opening LinkedIn Job: {app.job.title}...")
        page.goto(app.job.url, wait_until="load")
        page.wait_for_timeout(2000)

        easy_apply_btn = page.locator("button.jobs-apply-button, button:has-text('Easy Apply'), button:has-text('Apply now')")
        has_easy_apply = easy_apply_btn.count() > 0 and easy_apply_btn.first.is_visible()
        
        target_btn = None
        if has_easy_apply:
            target_btn = easy_apply_btn.first
        else:
            external_apply_btn = page.locator("button:has-text('Apply'), a:has-text('Apply on company website'), a[href*='apply'], a.jobs-apply-button")
            if external_apply_btn.count() > 0 and external_apply_btn.first.is_visible():
                try:
                    self.log_event(db, app.id, "Opening Company Careers Site", 75, f"Clicking Apply button to open {app.job.company} careers portal in browser...")
                    external_apply_btn.first.click()
                    page.wait_for_timeout(3000)
                    self.log_event(db, app.id, "Company Website Opened", 100, f"External careers form opened successfully! Please fill and complete the application in the new tab.")
                    return {
                        "status": "manual_apply_required",
                        "message": f"Opened external {app.job.company} careers website in a new tab. Please complete the application manually."
                    }
                except Exception as ex_ext:
                    logger.warning(f"Could not click external apply button: {ex_ext}")
            
            self.log_event(db, app.id, "Company Website Detected", 100, f"LinkedIn listing for {app.job.title} requires applying on company website (External ATS). Left for manual application as requested.")
            return {
                "status": "manual_apply_required",
                "message": f"LinkedIn listing for '{app.job.title}' requires applying on {app.job.company}'s website. Left for manual application."
            }

        if target_btn:
            target_btn.click()
            self.log_event(db, app.id, "Waiting for Form", 75, "Waiting 5 seconds for LinkedIn Easy Apply modal and screening questions to load...")
            page.wait_for_timeout(5000)

            submitted = False
            for step in range(6):
                pct = 70 + (step * 4)
                self.log_event(db, app.id, "Filling Fields", min(pct, 94), f"Completing LinkedIn Easy Apply step {step+1}...")
                
                if page.locator("button:has-text('Submit application')").is_visible():
                    if test_mode:
                        return {"status": "success", "message": "Test Mode: Halting before final LinkedIn submission"}
                    page.click("button:has-text('Submit application')")
                    page.wait_for_timeout(1000)
                    submitted = True
                    return {"status": "success", "message": "LinkedIn Easy Apply application completed"}

                self.auto_fill_visible_inputs(page, resume_data, resume_file_path, db, app)
                
                next_btn = page.locator("button:has-text('Next'), button:has-text('Review')")
                if next_btn.is_visible():
                    next_btn.click()
                    page.wait_for_timeout(500)
                else:
                    break

            # Check if modal is still open (meaning we didn't submit successfully or got stuck)
            is_modal_open = page.locator(".jpibfi, [class*='easy-apply-modal'], .jobs-easy-apply-modal").count() > 0
            if is_modal_open and not submitted:
                self.log_event(db, app.id, "Human Review Required", 95, "Easy Apply form is still open. Please check the open tab, answer any custom questions, and click Submit manually!")
                return {
                    "status": "human_action_required",
                    "message": "Playwright filled the initial steps. Please review the remaining fields and submit manually."
                }

            return {"status": "success", "message": "LinkedIn Easy Apply form completed"}

        return {
            "status": "manual_apply_required",
            "message": f"LinkedIn job '{app.job.title}' is not an Easy Apply role. Left for manual application."
        }

    def apply_fallback(self, page: Page, resume_data: dict, resume_file_path: str, job_url: str, db: Session, app: Application, test_mode: bool) -> dict:
        self.log_event(db, app.id, "Company Website Detected", 100, f"Listing for {app.job.company} is hosted directly on company website. Left for manual application as requested.")
        return {
            "status": "manual_apply_required",
            "message": f"Job at {app.job.company} requires applying directly on company website. Left for manual application."
        }

    # =========================================================================
    # Form Field Intelligence & AI Multi-Field Answering Engine
    # =========================================================================
    def auto_fill_visible_inputs(self, page: Page, resume_data: dict, resume_file_path: str, db: Session, app: Application):
        """Matches form inputs (text, number, date, select, radio, checkbox) using user profile rules and AI fallbacks."""
        import re
        import datetime
        inputs = page.locator("input, textarea, select")
        count = inputs.count()
        
        profile = app.user.profile if app and app.user else None
        
        for i in range(count):
            el = inputs.nth(i)
            if not el.is_visible() or not el.is_enabled():
                continue
                
            name = (el.get_attribute("name") or "").lower()
            id_attr = (el.get_attribute("id") or "").lower()
            placeholder = (el.get_attribute("placeholder") or "").lower()
            el_type = (el.get_attribute("type") or "text").lower()
            tag_name = el.evaluate("node => node.tagName").lower()
            label = el.evaluate("node => node.labels ? node.labels[0]?.innerText : ''").lower()
            
            # Fetch surrounding context if label is blank
            if not label:
                label = el.evaluate("""node => {
                    let parent = node.closest('label') || node.closest('.form-group') || node.closest('[class*="question"]') || node.parentElement;
                    return parent ? (parent.innerText || '') : '';
                }""").lower()
            
            identifier = f"{name} {id_attr} {placeholder} {label}".strip()
            question_text = label or placeholder or name

            # -----------------------------------------------------------------
            # 1. Checkboxes (Consent, Terms, Authorization)
            # -----------------------------------------------------------------
            if el_type == "checkbox":
                if any(w in identifier for w in ["agree", "consent", "terms", "confirm", "authorize", "policy", "condition", "yes", "subscribe", "relocate", "background"]):
                    self.log_event(db, app.id, "Checking Consent", 89, f"Checking consent box: {label[:30]}...")
                    try:
                        if not el.is_checked():
                            el.check(timeout=1000)
                    except Exception:
                        try:
                            el.click(timeout=1000)
                        except Exception:
                            pass
                continue

            # -----------------------------------------------------------------
            # 2. Radio Buttons (Yes/No, Work Authorization, Relocation)
            # -----------------------------------------------------------------
            if el_type == "radio":
                val = (el.get_attribute("value") or "").lower()
                text = (label or el.evaluate("node => node.nextSibling?.textContent || ''") or "").lower().strip()
                
                # Check for negative sponsorship questions ("Do you require sponsorship?")
                if "sponsor" in identifier or "sponsorship" in identifier or "visa" in identifier:
                    if "no" in val or "no" in text or "false" in val:
                        try:
                            el.check(timeout=1000)
                        except Exception:
                            el.click(timeout=1000)
                # Standard positive response
                elif any(w in val or w in text for w in ["yes", "true", "agree", "accept", "authorized", "immediate"]):
                    self.log_event(db, app.id, "Selecting Radio", 88, f"Selecting radio option: Yes/Agree")
                    try:
                        el.check(timeout=1000)
                    except Exception:
                        try:
                            el.click(timeout=1000)
                        except Exception:
                            pass
                continue

            # -----------------------------------------------------------------
            # 3. Select Dropdowns (AI Option Classification + Smart Defaults)
            # -----------------------------------------------------------------
            if tag_name == "select":
                if len(question_text) > 3:
                    options_data = el.evaluate("""node => {
                        return Array.from(node.options).map(o => ({ text: o.text, value: o.value }));
                    }""")
                    if options_data and len(options_data) > 1:
                        curr_val = el.evaluate("node => node.value")
                        if curr_val and curr_val != options_data[0]['value']:
                            continue
                        
                        # Check for Notice Period dropdown
                        if any(w in identifier for w in ["notice", "availability", "join", "start date"]):
                            notice_setting = (profile.notice_period if profile and profile.notice_period else "15 days").lower()
                            matched_idx = None
                            for idx, opt in enumerate(options_data):
                                opt_t = opt["text"].lower()
                                if "immediate" in notice_setting and ("immediate" in opt_t or "0" in opt_t or "15" in opt_t):
                                    matched_idx = idx
                                    break
                                elif "15" in notice_setting and ("15" in opt_t or "immediate" in opt_t or "1 month" in opt_t):
                                    matched_idx = idx
                                    break
                                elif "30" in notice_setting and ("30" in opt_t or "1 month" in opt_t):
                                    matched_idx = idx
                                    break
                            
                            if matched_idx is not None:
                                chosen = options_data[matched_idx]
                                self.log_event(db, app.id, "Selecting Notice Period", 87, f"Notice Period: '{chosen['text']}'")
                                el.select_option(value=chosen['value'])
                                self._save_qa(db, app.id, question_text, chosen['text'])
                                continue

                        options_str = ", ".join([f"Index {idx}: '{o['text']}'" for idx, o in enumerate(options_data)])
                        prompt = f"""For the screening question: '{question_text}'
Candidate profile: Title: {app.job.title}, Resume skills: {", ".join(resume_data.get('skills', []))}, Experience: {resume_data.get('experience', '')}.
Available options:
{options_str}

Which option index (0-based) is the best fit? Return ONLY the integer index (e.g. 0 or 1 or 2)."""
                        try:
                            res = ai_service.ask_ai(prompt, task_type="classification", timeout_override=5).strip()
                            idx_match = re.search(r'\d+', res)
                            if idx_match:
                                idx = int(idx_match.group(0))
                                if 0 <= idx < len(options_data):
                                    chosen = options_data[idx]
                                    self.log_event(db, app.id, "Selecting Option", 87, f"Selecting dropdown: '{chosen['text']}' for '{question_text[:25]}'...")
                                    el.select_option(value=chosen['value'])
                                    self._save_qa(db, app.id, question_text, chosen['text'])
                                    page.wait_for_timeout(300)
                        except Exception:
                            try:
                                el.select_option(index=1)
                            except Exception:
                                pass
                continue

            # -----------------------------------------------------------------
            # 4. Date Inputs (Available From, Start Date, Graduation Date)
            # -----------------------------------------------------------------
            if el_type == "date" or any(w in identifier for w in ["available from", "start date", "joining date"]):
                # Calculate start date based on notice period
                notice_str = (profile.notice_period if profile and profile.notice_period else "15").lower()
                num_days_match = re.search(r'\d+', notice_str)
                notice_days = int(num_days_match.group(0)) if num_days_match else 15
                target_date = datetime.date.today() + datetime.timedelta(days=notice_days)
                date_val = target_date.strftime("%Y-%m-%d")
                
                self.log_event(db, app.id, "Setting Start Date", 85, f"Entering start date: {date_val} ({notice_days} days notice)")
                try:
                    el.fill(date_val)
                except Exception:
                    self._human_type(el, date_val, page)
                self._save_qa(db, app.id, question_text, date_val)
                continue

            # -----------------------------------------------------------------
            # 5. Text, Number, Email, Tel, and Textarea Inputs
            # -----------------------------------------------------------------
            if el_type in ["text", "number", "tel", "email"] or tag_name == "textarea":
                # Contact info standard fields
                if "name" in identifier and "company" not in identifier and "skill" not in identifier:
                    name_val = resume_data.get("name") or (profile.full_name if profile else "Praveen Kumar")
                    self.log_event(db, app.id, "Typing Name", 82, f"Typing candidate name: {name_val}")
                    time.sleep(0.3)
                    self._human_type(el, name_val, page)
                    continue

                if "email" in identifier:
                    email_val = resume_data.get("email") or app.user.email
                    self.log_event(db, app.id, "Typing Email", 84, f"Entering email: {email_val}")
                    time.sleep(0.3)
                    self._human_type(el, email_val, page)
                    continue

                if "phone" in identifier or "mobile" in identifier or "tel" in identifier:
                    phone_val = resume_data.get("phone") or (profile.phone if profile else "+91 9504904499")
                    self.log_event(db, app.id, "Typing Phone", 86, f"Entering phone: {phone_val}")
                    time.sleep(0.3)
                    self._human_type(el, phone_val, page)
                    continue

                if "location" in identifier or "city" in identifier:
                    loc_val = resume_data.get("location") or (profile.location if profile else "India")
                    self.log_event(db, app.id, "Typing Location", 88, f"Entering location: {loc_val}")
                    time.sleep(0.3)
                    self._human_type(el, loc_val, page)
                    continue

                if "resume" in identifier or "file" in identifier or "cv" in identifier:
                    if el_type == "file":
                        self.log_event(db, app.id, "Uploading CV", 90, f"Uploading tailored PDF resume...")
                        time.sleep(0.6)
                        try:
                            el.set_input_files(resume_file_path)
                            page.wait_for_timeout(1000)
                        except Exception as upload_err:
                            logger.warning(f"File upload note: {upload_err}")
                    continue

                # -------------------------------------------------------------
                # 6. Smart Rule-Based Question Handling
                # -------------------------------------------------------------
                if not el.evaluate("node => node.value"):
                    if len(question_text) > 3:
                        is_number_input = el_type == "number" or "years" in identifier or "how many" in identifier
                        answer = None
                        
                        # Rule A: Notice Period
                        if any(w in identifier for w in ["notice", "days to join", "availability", "how soon"]):
                            notice_setting = (profile.notice_period if profile and profile.notice_period else "15 days").lower()
                            num_match = re.search(r'\d+', notice_setting)
                            if is_number_input:
                                answer = num_match.group(0) if num_match else "15"
                            else:
                                answer = f"{num_match.group(0)} Days" if num_match else "15 Days (Immediate)"
                            self.log_event(db, app.id, "Notice Period", 90, f"Answering notice period: '{answer}' from profile settings")

                        # Rule B: Experience in Technology (e.g. Python, React, SQL, Java, AWS)
                        elif "experience" in identifier or "years" in identifier or "how many years" in identifier:
                            # Search for technology names in the question
                            known_techs = ["python", "ai", "ml", "machine learning", "data science", "deep learning", "tensorflow", "pytorch", "keras", "nlp", "llm", "javascript", "typescript", "react", "node", "sql", "mysql", "fastapi", "django", "java", "c++", "aws", "docker", "git", "html", "css", "vue", "angular", "mongodb", "postgresql", "linux"]
                            matched_tech = next((t for t in known_techs if t in identifier), None)
                            
                            skills_list = [str(s).lower() for s in resume_data.get("skills", [])]
                            user_exp_total = resume_data.get("total_years_experience") or resume_data.get("experience_years") or 2
                            
                            if matched_tech:
                                has_tech = any(matched_tech in s for s in skills_list)
                                if has_tech:
                                    answer = str(user_exp_total if is_number_input else f"{user_exp_total} years")
                                else:
                                    # Fallback default for technology questions
                                    answer = "1" if is_number_input else "1 year"
                            else:
                                answer = str(user_exp_total if is_number_input else f"{user_exp_total} years")
                            
                            self.log_event(db, app.id, "Tech Experience", 90, f"Answering tech experience: '{answer}' for '{question_text[:25]}'")

                        # Rule C: Salary Expectations
                        elif "salary" in identifier or "ctc" in identifier or "compensation" in identifier:
                            if profile and profile.salary_expectation:
                                answer = profile.salary_expectation
                            elif is_number_input:
                                answer = str(int(profile.min_salary)) if (profile and profile.min_salary) else "600000"
                            else:
                                answer = "Negotiable / As per company standards"
                            self.log_event(db, app.id, "Salary Expectation", 90, f"Answering salary: '{answer}'")

                        # Rule D: Check Existing Saved Answer from Database
                        if not answer:
                            existing_ans = db.query(ApplicationAnswer).filter(
                                ApplicationAnswer.application_id == app.id,
                                ApplicationAnswer.question == question_text
                            ).first()
                            if existing_ans and existing_ans.answer:
                                answer = existing_ans.answer
                                self.log_event(db, app.id, "Saved Answer", 91, f"Using verified answer for: '{question_text[:30]}...'")

                        # Rule E: AI Dynamic Answer with Word-Count Limit
                        if not answer:
                            # Detect word count constraints
                            word_limit = 20 # Default concise length
                            limit_match = re.search(r'in\s+(\d+)\s+words', identifier)
                            if limit_match:
                                word_limit = int(limit_match.group(1))

                            number_hint = " Return ONLY a single numeric digit (e.g. 1 or 2)." if is_number_input else f" Write a punchy, first-person response strictly within {word_limit} words."
                            job_t = app.job.title if app and app.job else "Software Developer"
                            job_d = app.job.description if app and app.job else ""

                            self.log_event(db, app.id, "AI Answering", 92, f"AI generating answer for: '{question_text[:35]}...' (Limit: {word_limit} words)")
                            time.sleep(0.3)

                            try:
                                answer = ai_service.generate_answers(
                                    resume_data=resume_data,
                                    job_title=job_t,
                                    job_description=job_d,
                                    question=question_text + number_hint
                                )
                            except Exception as e:
                                logger.warning(f"AI generation failed for '{question_text}': {e}")
                                answer = "1" if is_number_input else "I tackle engineering challenges by analyzing core requirements, debugging systematically, and deploying clean, tested solutions."

                            if is_number_input:
                                num_match = re.search(r'\d+', str(answer))
                                answer = num_match.group(0) if num_match else "1"

                        # Type answer into form field
                        time.sleep(0.3)
                        self._human_type(el, str(answer), page)
                        self._save_qa(db, app.id, question_text, str(answer))

    def _save_qa(self, db: Session, application_id: int, question: str, answer: str):
        """Helper to persist or update application question & answer in database."""
        try:
            clean_q = question.strip()
            clean_a = answer.strip()
            if not clean_q or not clean_a:
                return

            existing = db.query(ApplicationAnswer).filter(
                ApplicationAnswer.application_id == application_id,
                ApplicationAnswer.question == clean_q
            ).first()

            if existing:
                existing.answer = clean_a
            else:
                db_ans = ApplicationAnswer(
                    application_id=application_id,
                    question=clean_q,
                    answer=clean_a,
                    is_generated=True
                )
                db.add(db_ans)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to save ApplicationAnswer for app {application_id}: {e}")
            db.rollback()

browser_manager = BrowserManager()
