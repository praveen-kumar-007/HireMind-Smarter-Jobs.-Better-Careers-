import re
import imaplib
import email
import logging
from email.header import decode_header
from sqlalchemy.orm import Session
from app.models.user import UserPlatformCredential
from app.services.ai_service import ai_service

logger = logging.getLogger(__name__)

class EmailVerificationService:
    def fetch_latest_otp(self, db: Session, user_id: int, platform_name: str, max_search_emails: int = 5) -> str:
        """
        Connects to the user's email IMAP server, searches for recent verification 
        messages related to the target platform, and extracts the numeric code / verification link.
        """
        # 1. Fetch email credentials from database
        cred = db.query(UserPlatformCredential).filter(
            UserPlatformCredential.user_id == user_id,
            UserPlatformCredential.platform == "email_imap"
        ).first()

        if not cred or not cred.is_active:
            logger.warning(f"No active email_imap credentials configured for user ID {user_id}. Cannot retrieve OTP.")
            return None

        username = cred.username
        password = cred.password
        extra = cred.extra_data or {}
        imap_host = extra.get("host", "imap.gmail.com")
        imap_port = int(extra.get("port", 993))

        try:
            logger.info(f"Connecting to IMAP server {imap_host}:{imap_port} for {username}...")
            mail = imaplib.IMAP4_SSL(imap_host, imap_port, timeout=15)
            mail.login(username, password)
            mail.select("INBOX")

            # 2. Search for messages from platform or mentioning OTP/verification
            search_query = f'OR OR SUBJECT "OTP" SUBJECT "verification" SUBJECT "{platform_name}"'
            status, messages = mail.search(None, search_query)
            
            if status != "OK" or not messages[0]:
                logger.info("No matching verification emails found.")
                mail.logout()
                return None

            # Get message list ids (most recent first)
            mail_ids = messages[0].split()
            mail_ids.reverse()

            for mail_id in mail_ids[:max_search_emails]:
                status, data = mail.fetch(mail_id, "(RFC822)")
                if status != "OK":
                    continue

                raw_email = data[0][1]
                msg = email.message_from_bytes(raw_email)

                # Decode subject
                subject_bytes, encoding = decode_header(msg["Subject"])[0]
                if isinstance(subject_bytes, bytes):
                    subject = subject_bytes.decode(encoding or "utf-8", errors="ignore")
                else:
                    subject = subject_bytes

                logger.info(f"Checking email subject: {subject}")

                # Extract body text
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(part.get("Content-Disposition"))
                        if content_type == "text/plain" and "attachment" not in content_disposition:
                            try:
                                body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                                break
                            except Exception:
                                pass
                else:
                    body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")

                # 3. Parse code using Regex patterns or local Qwen3 AI model
                otp = self.extract_otp_from_text(body, subject)
                if otp:
                    logger.info(f"Successfully extracted verification code: {otp}")
                    mail.logout()
                    return otp

            mail.logout()
        except Exception as e:
            logger.error(f"Error reading verification email: {e}")
        
        return None

    def extract_otp_from_text(self, body: str, subject: str) -> str:
        """Helper to find numeric OTP code or verification links using Regex or AI routing."""
        full_text = f"Subject: {subject}\n\n{body}"
        
        # Pattern 1: Look for login links / verification urls
        match_url = re.search(r'https?://[^\s<>"]+verify[^\s<>"]+', full_text, re.IGNORECASE)
        if match_url:
            return match_url.group(0)

        # Pattern 2: Look for 'verification code' or 'OTP' nearby numbers
        match_context = re.search(r'(?:code|otp|verification|password|pin)\D*(\d{4,8})', full_text, re.IGNORECASE)
        if match_context:
            return match_context.group(1)

        # Pattern 3: Look for 4 to 8 digit standalone numbers (common OTPs)
        match = re.search(r'\b\d{4,8}\b', full_text)
        if match:
            return match.group(0)

        # Fallback to local Qwen3 model (fast model) to extract the code
        prompt = f"""Extract the numerical verification code (OTP) or authentication URL from this email. Return ONLY the code or URL. If none is found, return "None".
Email Text:
{full_text[:1500]}
"""
        try:
            ai_otp = ai_service.ask_ai(prompt, task_type="extraction").strip()
            if ai_otp and "none" not in ai_otp.lower():
                if re.match(r'^\d{4,8}$', ai_otp) or ai_otp.startswith(('http://', 'https://')):
                    return ai_otp
        except Exception as e:
            logger.warning(f"AI OTP extraction failed: {e}")

        return None

email_verification_service = EmailVerificationService()
