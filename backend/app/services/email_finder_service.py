import re
import socket
import logging
from typing import Optional, List, Tuple, Dict, Any
from urllib.parse import urlparse
import dns.resolver

logger = logging.getLogger(__name__)

# Common non-corporate / platform domains to avoid sending cold hiring emails to
IGNORED_DOMAINS = {
    "naukri.com", "linkedin.com", "indeed.com", "internshala.com", "foundit.in",
    "workindia.in", "shine.com", "monster.com", "glassdoor.com", "google.com",
    "example.com", "domain.com", "test.com", "noreply.com", "no-reply.com"
}

# Standard corporate HR & Talent acquisition prefixes in order of priority
HR_PREFIXES = ["hr", "careers", "talent", "recruiting", "recruitment", "jobs", "hiring", "contact", "info"]

class EmailFinderService:
    def __init__(self):
        self.resolver = dns.resolver.Resolver()
        self.resolver.timeout = 3.0
        self.resolver.lifetime = 3.0

    def verify_email_domain_mx(self, email: str) -> Tuple[bool, str, List[str]]:
        """
        Verify if the given email has a valid syntax and its domain possesses active MX mail servers.
        Returns: (is_valid, domain, mx_hosts)
        """
        if not email or "@" not in email:
            return False, "", []

        email_clean = email.strip().lower()
        # Basic regex check
        if not re.match(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$', email_clean):
            return False, "", []

        domain = email_clean.split("@")[-1].strip().lower()
        if domain in IGNORED_DOMAINS:
            return False, domain, []

        try:
            answers = self.resolver.resolve(domain, 'MX')
            mx_hosts = [str(r.exchange).rstrip('.') for r in answers if r.exchange]
            if mx_hosts:
                return True, domain, mx_hosts
        except Exception as e:
            logger.debug(f"MX lookup failed for {domain}: {e}")
            # Fallback to checking direct A record for domain mail host
            try:
                a_records = self.resolver.resolve(domain, 'A')
                if a_records:
                    return True, domain, [domain]
            except Exception:
                pass

        return False, domain, []

    def extract_emails_from_text(self, text: str) -> List[str]:
        """Extract all non-blacklisted emails from a block of text."""
        if not text:
            return []
        
        email_pattern = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
        matches = re.findall(email_pattern, text)
        valid_emails = []
        seen = set()

        for em in matches:
            em_clean = em.strip().lower().rstrip('.')
            domain = em_clean.split('@')[-1]
            if domain not in IGNORED_DOMAINS and em_clean not in seen:
                seen.add(em_clean)
                valid_emails.append(em_clean)

        return valid_emails

    def extract_company_domain_from_url(self, url: str) -> Optional[str]:
        """Extract company root domain from job posting or career URL if not a standard portal."""
        if not url:
            return None
        try:
            parsed = urlparse(url)
            netloc = parsed.netloc.lower()
            if netloc.startswith("www."):
                netloc = netloc[4:]
            
            # If it's a known job board, skip
            for ignored in IGNORED_DOMAINS:
                if ignored in netloc:
                    return None

            # Handle applicant tracking systems like jobs.lever.co/company or boards.greenhouse.io/company
            path_parts = [p for p in parsed.path.split('/') if p]
            if "lever.co" in netloc and path_parts:
                return f"{path_parts[0]}.com"
            if "greenhouse.io" in netloc and path_parts:
                return f"{path_parts[0]}.com"
            if "smartrecruiters.com" in netloc and path_parts:
                return f"{path_parts[0]}.com"

            parts = netloc.split('.')
            if len(parts) >= 2:
                return ".".join(parts[-2:])
        except Exception:
            pass
        return None

    def clean_company_name(self, company: str) -> str:
        """Strip legal entity suffixes (Pvt Ltd, LLC, Technologies, etc.) to get base brand name."""
        name = str(company or "").strip()
        # Remove parentheses content e.g. "Google (Alphabet)"
        name = re.sub(r'\(.*?\)', '', name)
        # Remove common corporate suffixes
        suffixes = [
            r'\bpvt\.?\s*ltd\.?', r'\bprivate\s*limited\b', r'\bltd\.?', r'\bllc\b', r'\binc\.?',
            r'\btechnologies\b', r'\btechnology\b', r'\bsolutions\b', r'\bservices\b',
            r'\bgroup\b', r'\bconsulting\b', r'\bsoftware\b', r'\bglobal\b', r'\bindia\b'
        ]
        for s in suffixes:
            name = re.sub(s, '', name, flags=re.IGNORECASE)
        # Keep alphanumeric
        clean = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
        return clean

    def discover_company_domain(self, company: str, job_url: str = "") -> Optional[str]:
        """
        Discover the verified official domain of a company via URL analysis, TLD probing, and DNS validation.
        """
        # 1. Try URL extraction
        url_domain = self.extract_company_domain_from_url(job_url)
        if url_domain:
            is_valid, domain, _ = self.verify_email_domain_mx(f"info@{url_domain}")
            if is_valid:
                return domain

        # 2. Try common TLDs with sanitized company name
        base_name = self.clean_company_name(company)
        if not base_name or len(base_name) < 2:
            return None

        candidate_domains = [
            f"{base_name}.com",
            f"{base_name}.in",
            f"{base_name}.co.in",
            f"{base_name}.ai",
            f"{base_name}.io",
            f"{base_name}.org"
        ]

        for domain in candidate_domains:
            is_valid, verified_domain, _ = self.verify_email_domain_mx(f"hr@{domain}")
            if is_valid:
                return verified_domain

        return f"{base_name}.com"

    def find_verified_company_hr_email(self, company: str, job_desc: str = "", job_url: str = "") -> Dict[str, Any]:
        """
        Comprehensive multi-stage discovery of verified active HR / Career email and company profile CC address.
        Stages:
            1. AI intelligent domain and inbox discovery
            2. Extract emails from job description & verify MX
            3. Discover verified company domain and test HR prefixes
            4. Live search verification fallback
        """
        # Stage 1: Fast AI Domain and Email Discovery
        ai_result = self._discover_with_ai(company, job_desc, job_url)
        if ai_result and ai_result.get("hr_email"):
            is_valid, domain, mx_hosts = self.verify_email_domain_mx(ai_result["hr_email"])
            if is_valid:
                cc_email = ai_result.get("cc_email") or f"info@{domain}"
                return {
                    "recipient_email": ai_result["hr_email"],
                    "cc_email": cc_email,
                    "domain": domain,
                    "status": "VERIFIED_ACTIVE",
                    "source": f"AI Discovery & Verified Mail Server ({domain})",
                    "is_active_mx": True,
                    "mx_hosts": mx_hosts[:2],
                    "alternatives": [f"careers@{domain}", f"talent@{domain}", f"jobs@{domain}"]
                }

        # Stage 2: Check listing description for real email
        desc_emails = self.extract_emails_from_text(job_desc)
        for email_candidate in desc_emails:
            is_valid, domain, mx_hosts = self.verify_email_domain_mx(email_candidate)
            if is_valid:
                # Generate alternatives for same domain
                alternatives = [f"{prefix}@{domain}" for prefix in HR_PREFIXES if f"{prefix}@{domain}" != email_candidate]
                cc_email = f"info@{domain}" if email_candidate != f"info@{domain}" else f"careers@{domain}"
                return {
                    "recipient_email": email_candidate,
                    "cc_email": cc_email,
                    "domain": domain,
                    "status": "VERIFIED_ACTIVE",
                    "source": "Job Listing Description (Verified MX)",
                    "is_active_mx": True,
                    "mx_hosts": mx_hosts[:2],
                    "alternatives": alternatives[:4]
                }

        # Stage 3: Discover company domain and test HR prefixes
        verified_domain = self.discover_company_domain(company, job_url)
        if verified_domain:
            is_valid, domain, mx_hosts = self.verify_email_domain_mx(f"hr@{verified_domain}")
            if is_valid:
                primary_email = f"hr@{domain}"
                cc_email = f"info@{domain}"
                alternatives = [
                    f"careers@{domain}",
                    f"talent@{domain}",
                    f"recruiting@{domain}",
                    f"jobs@{domain}"
                ]
                return {
                    "recipient_email": primary_email,
                    "cc_email": cc_email,
                    "domain": domain,
                    "status": "VERIFIED_ACTIVE",
                    "source": f"Company Mail Server ({domain})",
                    "is_active_mx": True,
                    "mx_hosts": mx_hosts[:2],
                    "alternatives": alternatives
                }

        # Stage 4: Live Chromium / Search Fallback
        search_email = self._live_chromium_search_hr_email(company)
        if search_email:
            is_valid, domain, mx_hosts = self.verify_email_domain_mx(search_email)
            if is_valid:
                alternatives = [f"{prefix}@{domain}" for prefix in HR_PREFIXES if f"{prefix}@{domain}" != search_email]
                return {
                    "recipient_email": search_email,
                    "cc_email": f"info@{domain}",
                    "domain": domain,
                    "status": "VERIFIED_ACTIVE",
                    "source": "Live Search Verification",
                    "is_active_mx": True,
                    "mx_hosts": mx_hosts[:2],
                    "alternatives": alternatives[:4]
                }

        # Safe fallback with active verification warning
        base_clean = self.clean_company_name(company) or "company"
        fallback_email = f"hr@{base_clean}.com"
        fallback_cc = f"info@{base_clean}.com"
        return {
            "recipient_email": fallback_email,
            "cc_email": fallback_cc,
            "domain": f"{base_clean}.com",
            "status": "AI_SUGGESTED",
            "source": "AI Domain Deduction",
            "is_active_mx": False,
            "mx_hosts": [],
            "alternatives": [
                f"careers@{base_clean}.com",
                f"talent@{base_clean}.com",
                f"jobs@{base_clean}.com"
            ]
        }

    def _discover_with_ai(self, company: str, job_desc: str = "", job_url: str = "") -> Optional[Dict[str, str]]:
        """Use fast AI model to deduce the official website domain, HR email, and company profile CC address."""
        from app.services.ai_service import ai_service
        prompt = f"""You are an expert AI recruiter tool. Find the official company domain, verified HR email, and general company profile contact email for this company.

Company Name: {company}
Job URL: {job_url}
Job Description Excerpt: {job_desc[:600]}

Respond ONLY in valid JSON with these keys:
{{
  "domain": "company domain (e.g. habilelabs.com)",
  "hr_email": "hr@domain.com or careers@domain.com",
  "cc_email": "info@domain.com or contact@domain.com"
}}"""
        try:
            res = ai_service.ask_ai(prompt, task_type="extraction", timeout_override=3)
            import json, re
            match = re.search(r'\{.*\}', res, re.DOTALL)
            if match:
                data = json.loads(match.group(0))
                if data.get("hr_email") and "@" in data["hr_email"]:
                    return data
        except Exception as e:
            logger.debug(f"AI email discovery skipped: {e}")
        return None

    def _live_chromium_search_hr_email(self, company: str) -> Optional[str]:
        """Use fast HTTP search to locate the company's real career contact."""
        try:
            import requests
            query = f"{company} careers hr email contact"
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            resp = requests.get(f"https://html.duckduckgo.com/html/?q={query}", headers=headers, timeout=4)
            if resp.status_code == 200:
                emails = self.extract_emails_from_text(resp.text)
                for em in emails:
                    if any(prefix in em.lower() for prefix in ["hr@", "careers@", "talent@", "jobs@", "recruiting@"]):
                        return em
        except Exception as e:
            logger.debug(f"Live web search for {company} email failed: {e}")
        return None

email_finder_service = EmailFinderService()
