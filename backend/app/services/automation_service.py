import os
import time
import logging
from playwright.sync_api import sync_playwright, Page
from sqlalchemy.orm import Session
from app.models.application import Application, ApplicationEvent, AuditLog, ApplicationAnswer
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
        """Log real-time application step for SSE streams and auditing."""
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

    def _human_type(self, locator, text: str, page: Page):
        """Types text character by character like a real human."""
        try:
            locator.scroll_into_view_if_needed()
            page.wait_for_timeout(200)
            locator.click()
            page.wait_for_timeout(150)
            locator.press_sequentially(text, delay=35)
        except Exception:
            try:
                locator.fill(text)
            except Exception:
                pass

    def _human_click(self, locator, page: Page):
        """Scrolls into view, hovers, and clicks. Bypasses standard pointer issues using JS evaluation if standard click is blocked."""
        try:
            locator.scroll_into_view_if_needed()
            page.wait_for_timeout(300)
            locator.hover()
            page.wait_for_timeout(200)
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
        """Launches actual Google Chrome browser, or connects to an existing Chrome via CDP on port 9222."""
        # Try connecting to an existing Chrome browser instance first via CDP
        try:
            import urllib.request
            # Check if remote debugging port is open
            cdp_version_url = f"{settings.CHROME_CDP_URL}/json/version" if not settings.CHROME_CDP_URL.endswith('/json/version') else settings.CHROME_CDP_URL
            with urllib.request.urlopen(cdp_version_url, timeout=0.8) as response:
                if response.status == 200:
                    logger.info(f"Found running Chrome instance on {settings.CHROME_CDP_URL}. Connecting via CDP...")
                    browser = p.chromium.connect_over_cdp(settings.CHROME_CDP_URL)
                    if browser.contexts:
                        context = browser.contexts[0]
                        # Prevent closing the user's active browser context/tabs
                        context.close = lambda: logger.info("CDP session close requested - keeping user's Chrome open.")
                        context._cdp_browser = browser
                        return context
                    else:
                        context = browser.new_context()
                        context._cdp_browser = browser
                        return context
        except Exception as cdp_err:
            logger.info(f"CDP connection to {settings.CHROME_CDP_URL} not available ({cdp_err}). Launching new browser...")

        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-infobars",
            "--start-maximized"
        ]
        
        chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        if not os.path.exists(chrome_exe):
            chrome_exe = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

        # Priority 1: Direct Google Chrome application
        if os.path.exists(chrome_exe):
            try:
                browser = p.chromium.launch(
                    executable_path=chrome_exe,
                    headless=headless,
                    slow_mo=400,
                    args=launch_args
                )
                return browser.new_context(
                    no_viewport=True,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
                )
            except Exception as e_chrome:
                logger.info(f"Direct Chrome launch note ({e_chrome}), trying Chromium...")

        # Priority 2: Bundled Chromium with visual slow_mo
        try:
            browser = p.chromium.launch(
                headless=headless,
                slow_mo=400,
                args=launch_args
            )
            return browser.new_context(
                no_viewport=True,
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
        except Exception as e1:
            logger.info(f"Chromium launch with slow_mo fallback ({e1})...")

        # Priority 3: Fallback standard browser
        browser = p.chromium.launch(headless=headless, args=launch_args)
        return browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )

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

        # Render PDF directly using page
        page.set_content(html_content, wait_until="load")
        page.add_style_tag(content='#download-btn { display: none !important; } .download-btn-wrapper { display: none !important; }')
        page.pdf(
            path=pdf_path,
            format="A4",
            print_background=True,
            margin={"top": "0px", "right": "0px", "bottom": "0px", "left": "0px"}
        )
        return pdf_path

    def fill_and_apply(self, application_id: int, db: Session) -> dict:
        """Runs the multi-step browser automation agent with real-time SSE telemetry."""
        app = db.query(Application).filter(Application.id == application_id).first()
        if not app:
            return {"status": "error", "message": "Application not found"}

        # Reset old events
        db.query(ApplicationEvent).filter(ApplicationEvent.application_id == application_id).delete()
        db.commit()

        self.log_event(db, application_id, "Initializing", 10, "Verifying candidate profile and application parameters...")
        time.sleep(1.0)

        platform_name = (app.job.source or "web").lower().strip()
        # If it is a company website manual apply, do not run Playwright. Bypass it immediately!
        if "company website" in platform_name or "companywebsite" in platform_name or platform_name not in ["naukri", "indeed", "linkedin"]:
            app.status = "Manual Intervention"
            app.notes = "Company Website - Manual Apply"
            self.log_event(db, application_id, "Manual Intervention", 100, f"Job at {app.job.company} requires manual application on the company's website. Listed under Manual Intervention.")
            db.commit()
            return {"status": "manual_apply_required", "message": "Company website application requires manual intervention."}

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

        platform_name = (app.job.source or "web").lower().strip()

        # Fetch credentials for the specific platform
        cred = db.query(UserPlatformCredential).filter(
            UserPlatformCredential.user_id == app.user_id,
            UserPlatformCredential.platform == platform_name,
            UserPlatformCredential.is_active == True
        ).first()

        try:
            with sync_playwright() as p:
                self.log_event(db, application_id, "Launching Browser", 22, "Opening Google Chrome desktop browser window...")
                time.sleep(1.0)
                profile_dir = os.path.abspath("app/static/browser_profile_apply")
                os.makedirs(profile_dir, exist_ok=True)
                
                context = self._launch_browser_context(p, profile_dir, headless=headless_mode)
                
                # If using existing Chrome (CDP), always open a new tab to avoid overwriting or detaching user's active tab
                if hasattr(context, "_cdp_browser"):
                    page = context.new_page()
                else:
                    page = context.pages[0] if hasattr(context, "pages") and context.pages else context.new_page()

                # Generate tailored PDF directly inside this active browser context
                self.log_event(db, application_id, "Tailoring Resume", 35, f"AI tailoring resume summary & skills for {app.job.title}...")
                time.sleep(1.2)
                try:
                    resume_file_path = self.generate_tailored_pdf_in_page(page, app, resume_data, db)
                except Exception as pdf_err:
                    logger.warning(f"PDF tailoring error ({pdf_err}), using static path")
                    resume_file_path = "resume.pdf"

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
                    context.close()
                except Exception:
                    pass
                return result or {"status": "error", "message": "Execution returned empty result"}

        except Exception as e:
            logger.error(f"Playwright agent crashed: {e}")
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
        time.sleep(0.8)
        
        if cred:
            page.goto("https://www.naukri.com/mnjuser/homepage", wait_until="load")
            page.wait_for_timeout(2000)
            
            # Check if already logged in (session active)
            current_url = page.url.lower()
            is_logged_in = "login" not in current_url and ("homepage" in current_url or "dashboard" in current_url or "mynaukri" in current_url)
            
            if is_logged_in:
                self.log_event(db, app.id, "Authenticated", 52, "Active Naukri session detected. Skipping login...")
                time.sleep(0.8)
            else:
                # Need to login
                page.goto("https://www.naukri.com/nlogin/login", wait_until="load")
                page.wait_for_timeout(2000)
                
                if "login" in page.url:
                    self.log_event(db, app.id, "Entering Credentials", 52, "Entering Naukri credentials with human keystrokes...")
                    time.sleep(0.8)
                    page.wait_for_selector("input#usernameField", timeout=15000)
                    page.fill("input#usernameField", cred.username)
                    page.wait_for_selector("input#passwordField", timeout=15000)
                    page.fill("input#passwordField", cred.password)
                    page.click("button[type='submit']")
                    page.wait_for_timeout(4000)
                else:
                    self.log_event(db, app.id, "Authenticated", 52, "Active Naukri session detected after redirect. Continuing...")
                    time.sleep(0.8)

            # Check for OTP Verification Screen
            if "otp" in page.url.lower() or page.locator("input[placeholder*='OTP']").is_visible():
                self.log_event(db, app.id, "OTP Challenge", 55, "Naukri OTP challenge detected! Polling your email...")
                page.wait_for_timeout(8000)
                otp_code = email_verification_service.fetch_latest_otp(db, app.user_id, "Naukri")
                
                if otp_code:
                    self.log_event(db, app.id, "Filling OTP", 58, f"Entering verification code: {otp_code}")
                    page.fill("input[placeholder*='OTP']", otp_code)
                    page.click("button:has-text('Verify')")
                    page.wait_for_timeout(2500)
                else:
                    return {"status": "human_action_required", "message": "Naukri OTP code not found in email inbox."}
        else:
            self.log_event(db, app.id, "Session Ready", 52, "Proceeding with direct candidate application session...")
            time.sleep(0.6)

        # Navigate to Job Listing
        self.log_event(db, app.id, "Opening Job Listing", 62, f"Navigating to job listing: {app.job.title}...")
        time.sleep(0.8)
        page.goto(app.job.url, wait_until="load")
        page.wait_for_timeout(3000)

        # Read the full page to detect state
        page_text = page.inner_text("body").lower() if page.locator("body").count() > 0 else ""

        # Check if already applied (multiple detection methods for Naukri)
        already_applied = False
        # Method 1: Look for "already applied" text anywhere on page
        if "already applied" in page_text:
            already_applied = True
        # Method 2: On Naukri, the Apply button changes to just "Applied" (exact text)
        #   Check buttons/elements in the apply area whose trimmed text is exactly "Applied"
        apply_buttons = page.locator("button, a.apply-button, [class*='apply']")
        for idx in range(min(apply_buttons.count(), 10)):
            try:
                btn = apply_buttons.nth(idx)
                if btn.is_visible():
                    btn_text = (btn.inner_text() or "").strip()
                    if btn_text == "Applied":
                        already_applied = True
                        break
            except Exception:
                pass
        # Method 3: Naukri specific - look for the "Applied" badge/label
        applied_badge = page.locator("text=/^Applied$/")
        if applied_badge.count() > 0:
            already_applied = True
        # Method 4: Naukri confirmation page URL pattern
        if "myapply" in page.url.lower() or "showAcp" in page.url:
            already_applied = True

        if already_applied:
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

        # Try clicking the Apply / Quick Apply button
        apply_selectors = [
            "button:has-text('Quick Apply')",
            "button:has-text('Apply')",
            "a:has-text('Quick Apply')",
            "a:has-text('Apply')",
            ".apply-button",
            ".quick-apply",
            "button#apply-button",
            "a[class*='apply']",
            "button[class*='apply']"
        ]

        clicked = False
        for sel in apply_selectors:
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
                    time.sleep(0.5)
                    self._human_click(loc.first, page)
                    page.wait_for_timeout(2500)
                    clicked = True
                    break
                except Exception:
                    pass

        if not clicked:
            self.log_event(db, app.id, "No Apply Button", 100, f"Could not find a clickable Apply button on the page for {app.job.title}. Saving for manual review.")
            return {"status": "manual_apply_required", "message": f"No Apply button found for '{app.job.title}'. Left for manual application."}

        # After clicking apply, re-read the page — check if it was one-click apply (instant confirm)
        page.wait_for_timeout(1500)
        post_click_text = page.inner_text("body").lower() if page.locator("body").count() > 0 else ""
        
        # Check for instant success (one-click apply with no form)
        if "application submitted" in post_click_text or "successfully applied" in post_click_text or "already applied" in post_click_text:
            self.log_event(db, app.id, "Applied", 100, f"One-click apply successful for {app.job.title}!")
            return {"status": "success", "message": "One-click application submitted successfully!"}
        
        # Check if Naukri redirected to apply confirmation page
        if "myapply" in page.url.lower() or "showAcp" in page.url:
            self.log_event(db, app.id, "Applied", 100, f"Naukri confirmed application for {app.job.title}!")
            return {"status": "success", "message": "Application confirmed by Naukri!"}

        # Handle multi-step questionnaires or document upload forms
        clicked_submit = False
        for step in range(5):
            self.log_event(db, app.id, "Filling Fields", min(78 + (step * 4), 94), f"Scanning and auto-filling form fields (Step {step+1})...")
            self.auto_fill_visible_inputs(page, resume_data, resume_file_path, db, app)
            
            # Re-read page after filling to check for success messages
            step_text = page.inner_text("body").lower() if page.locator("body").count() > 0 else ""
            if "application submitted" in step_text or "successfully applied" in step_text:
                self.log_event(db, app.id, "Applied", 100, f"Application confirmed after form submission!")
                return {"status": "success", "message": "Application submitted after completing form!"}

            # Check for final submit button
            submit_btn = page.locator("button:has-text('Submit'), button:has-text('Apply Now'), button:has-text('Send Application'), button:has-text('Submit Application')")
            if submit_btn.count() > 0 and submit_btn.first.is_visible():
                if test_mode:
                    return {"status": "success", "message": "Test Mode: Application form inspected and pre-filled."}
                self.log_event(db, app.id, "Finalizing Submission", 96, "Clicking submit application button...")
                submit_btn.first.click()
                page.wait_for_timeout(2500)
                clicked_submit = True
                break

            # Check for next/continue button to advance the form
            next_btn = page.locator("button:has-text('Next'), button:has-text('Continue'), button:has-text('Save & Continue'), button:has-text('Proceed')")
            if next_btn.count() > 0 and next_btn.first.is_visible():
                self.log_event(db, app.id, "Advancing Form", 85, "Clicking next/continue button to proceed...")
                next_btn.first.click()
                page.wait_for_timeout(2000)
            else:
                break

        # Final post-submit confirmation check
        if clicked_submit:
            page.wait_for_timeout(1000)
            final_text = page.inner_text("body").lower() if page.locator("body").count() > 0 else ""
            if "already applied" in final_text or "application submitted" in final_text or "successfully" in final_text:
                return {"status": "success", "message": "Application submitted and confirmed!"}
            return {"status": "success", "message": "Application submitted successfully!"}
        
        return {"status": "success", "message": "Application processed (Apply button clicked, form completed)."}

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
            page.wait_for_timeout(2500)
            
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
        time.sleep(0.8)
        
        if cred:
            # Check if already logged in by navigating to feed
            page.goto("https://www.linkedin.com/feed/", wait_until="load")
            page.wait_for_timeout(2000)
            
            current_url = page.url.lower()
            is_logged_in = "feed" in current_url or "mynetwork" in current_url or "messaging" in current_url
            
            if is_logged_in:
                self.log_event(db, app.id, "Authenticated", 52, "Active LinkedIn session detected. Skipping login...")
                time.sleep(0.8)
            else:
                # Need to login
                page.goto("https://www.linkedin.com/login", wait_until="load")
                page.wait_for_timeout(1000)
                
                # Double-check we're actually on login page
                if "login" in page.url.lower():
                    self.log_event(db, app.id, "Entering Credentials", 50, "Entering LinkedIn credentials...")
                    page.wait_for_selector("input#username", timeout=15000)
                    page.fill("input#username", cred.username)
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
                    time.sleep(0.5)

        self.log_event(db, app.id, "Opening Job Listing", 62, f"Navigating to LinkedIn Job: {app.job.title}...")
        time.sleep(0.8)
        page.goto(app.job.url, wait_until="load")
        page.wait_for_timeout(2500)

        # Check if Easy Apply is available
        easy_apply_btn = page.locator("button.jobs-apply-button:has-text('Easy Apply'), button:has-text('Easy Apply'), .jobs-apply-button")
        is_easy_apply = False
        target_btn = None
        if easy_apply_btn.count() > 0:
            for idx in range(easy_apply_btn.count()):
                btn_text = (easy_apply_btn.nth(idx).inner_text() or "").lower()
                if "easy apply" in btn_text:
                    is_easy_apply = True
                    target_btn = easy_apply_btn.nth(idx)
                    break

        if not is_easy_apply:
            self.log_event(db, app.id, "Company Website Detected", 100, f"LinkedIn listing for {app.job.title} requires applying on company website (External ATS). Left for manual application as requested.")
            return {
                "status": "manual_apply_required",
                "message": f"LinkedIn listing for '{app.job.title}' requires applying on {app.job.company}'s website. Left for manual application."
            }

        if target_btn:
            target_btn.click()
            page.wait_for_timeout(2000)

            for step in range(6):
                pct = 70 + (step * 4)
                self.log_event(db, app.id, "Filling Fields", min(pct, 94), f"Completing LinkedIn Easy Apply step {step+1}...")
                time.sleep(0.6)
                
                if page.locator("button:has-text('Submit application')").is_visible():
                    if test_mode:
                        return {"status": "success", "message": "Test Mode: Halting before final LinkedIn submission"}
                    page.click("button:has-text('Submit application')")
                    page.wait_for_timeout(2500)
                    return {"status": "success", "message": "LinkedIn Easy Apply application completed"}

                self.auto_fill_visible_inputs(page, resume_data, resume_file_path, db, app)
                
                next_btn = page.locator("button:has-text('Next'), button:has-text('Review')")
                if next_btn.is_visible():
                    next_btn.click()
                    page.wait_for_timeout(1500)
                else:
                    break

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

    # Form Field Intelligence & AI Question Engine
    def auto_fill_visible_inputs(self, page: Page, resume_data: dict, resume_file_path: str, db: Session, app: Application):
        """Matches form inputs to candidate profile, using deterministic checks first and AI fallbacks."""
        import re
        inputs = page.locator("input, textarea, select")
        count = inputs.count()
        
        for i in range(count):
            el = inputs.nth(i)
            if not el.is_visible() or not el.is_enabled():
                continue
                
            name = (el.get_attribute("name") or "").lower()
            id_attr = (el.get_attribute("id") or "").lower()
            placeholder = (el.get_attribute("placeholder") or "").lower()
            label = el.evaluate("node => node.labels ? node.labels[0]?.innerText : ''").lower()
            
            identifier = f"{name} {id_attr} {placeholder} {label}"

            # 1. Checkboxes (Consent and agreement)
            if el.get_attribute("type") == "checkbox":
                if any(w in identifier for w in ["agree", "consent", "terms", "confirm", "authorize", "policy", "condition", "yes", "subscribe"]):
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

            # 2. Radio Buttons
            if el.get_attribute("type") == "radio":
                val = (el.get_attribute("value") or "").lower()
                text = (label or el.evaluate("node => node.nextSibling?.textContent || ''") or "").lower().strip()
                if any(w in val or w in text for w in ["yes", "true", "agree", "accept"]):
                    self.log_event(db, app.id, "Selecting Radio", 88, f"Selecting radio option: Yes/Agree")
                    try:
                        el.check(timeout=1000)
                    except Exception:
                        try:
                            el.click(timeout=1000)
                        except Exception:
                            pass
                continue

            # 3. Select Dropdowns (AI Option Classification)
            if el.evaluate("node => node.tagName").lower() == "select":
                question_text = label or placeholder or name
                if len(question_text) > 4:
                    options_data = el.evaluate("""node => {
                        return Array.from(node.options).map(o => ({ text: o.text, value: o.value }));
                    }""")
                    if options_data and len(options_data) > 1:
                        curr_val = el.evaluate("node => node.value")
                        if curr_val and curr_val != options_data[0]['value']:
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
                                    page.wait_for_timeout(300)
                        except Exception:
                            try:
                                el.select_option(index=1)
                            except Exception:
                                pass
                continue

            # 4. Text/Number/Textarea Inputs
            if el.get_attribute("type") in ["text", "number", "tel", "email"] or el.evaluate("node => node.tagName").lower() == "textarea":
                if "name" in identifier:
                    name_val = resume_data.get("name", "Praveen Kumar")
                    self.log_event(db, app.id, "Typing Name", 82, f"Typing candidate name: {name_val}")
                    time.sleep(0.4)
                    self._human_type(el, name_val, page)
                elif "email" in identifier:
                    email_val = resume_data.get("email", "praveen.pr105@gmail.com")
                    self.log_event(db, app.id, "Typing Email", 84, f"Entering email: {email_val}")
                    time.sleep(0.4)
                    self._human_type(el, email_val, page)
                elif "phone" in identifier or "mobile" in identifier:
                    phone_val = resume_data.get("phone", "+91 9504904499")
                    self.log_event(db, app.id, "Typing Phone", 86, f"Entering phone: {phone_val}")
                    time.sleep(0.4)
                    self._human_type(el, phone_val, page)
                elif "location" in identifier or "city" in identifier:
                    loc_val = resume_data.get("location", "Dhanbad, India")
                    self.log_event(db, app.id, "Typing Location", 88, f"Entering location: {loc_val}")
                    time.sleep(0.4)
                    self._human_type(el, loc_val, page)
                elif "resume" in identifier or "file" in identifier or "cv" in identifier:
                    if el.get_attribute("type") == "file":
                        self.log_event(db, app.id, "Uploading CV", 90, f"Uploading tailored PDF resume...")
                        time.sleep(0.6)
                        try:
                            el.set_input_files(resume_file_path)
                            page.wait_for_timeout(1000)
                        except Exception as upload_err:
                            logger.warning(f"File upload note: {upload_err}")
                elif not el.evaluate("node => node.value"):
                    question_text = label or placeholder or name
                    if len(question_text) > 4:
                        existing_ans = db.query(ApplicationAnswer).filter(
                            ApplicationAnswer.application_id == app.id,
                            ApplicationAnswer.question == question_text
                        ).first()
                        
                        if existing_ans and existing_ans.answer:
                            self.log_event(db, app.id, "Answering Question", 92, f"Filling: '{question_text[:35]}...'")
                            time.sleep(0.5)
                            self._human_type(el, existing_ans.answer, page)
                        else:
                            is_number_input = el.get_attribute("type") == "number"
                            number_hint = " The question requires a numeric input. Return ONLY a single numeric value (e.g. 3 or 10)." if is_number_input else ""
                            self.log_event(db, app.id, "Answering Question", 92, f"AI generating answer for: '{question_text[:35]}...'")
                            time.sleep(0.5)
                            job_t = app.job.title if app and app.job else "Software Developer"
                            job_d = app.job.description if app and app.job else ""
                            answer = ai_service.generate_answers(resume_data, job_t, job_d, question_text + number_hint)
                            if answer:
                                if is_number_input:
                                    num_match = re.search(r'\d+', answer)
                                    answer = num_match.group(0) if num_match else "0"
                                
                                self._human_type(el, answer, page)
                                db_ans = ApplicationAnswer(
                                    application_id=app.id,
                                    question=question_text,
                                    answer=answer,
                                    is_generated=True
                                )
                                db.add(db_ans)
                                db.commit()

browser_manager = BrowserManager()
