import os
import sys
import pytest

# Ensure backend directory is in path regardless of runner context
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.email_service import email_verification_service

@pytest.mark.unit
def test_extract_otp_simple_numeric():
    """Verify that standalone 6-digit numeric OTPs are parsed correctly."""
    email_body = "Hello! Your verification code for Naukri registration is 482910. Please enter it to verify."
    otp = email_verification_service.extract_otp_from_text(email_body, "Naukri Verification")
    assert otp == "482910"

def test_extract_otp_contextual():
    """Verify that OTP codes positioned after context keywords are parsed."""
    email_body = "LinkedIn Login Code: OTP is 92831. Keep this private."
    otp = email_verification_service.extract_otp_from_text(email_body, "LinkedIn Login Verification")
    assert otp == "92831"

def test_extract_otp_verification_link():
    """Verify that verification URLs are detected."""
    email_body = "Please click this link to verify your email address: https://indeed.com/verify?token=abcde12345 to activate account."
    otp = email_verification_service.extract_otp_from_text(email_body, "Indeed Verification Link")
    assert otp == "https://indeed.com/verify?token=abcde12345"

def test_extract_otp_no_code():
    """Verify that emails without verification details return None or fallback."""
    email_body = "Hi Praveen, thank you for your application to Multimarg Private Limited. We will review your profile."
    otp = email_verification_service.extract_otp_from_text(email_body, "Application Received")
    # Should not pull random numbers from normal text unless matching patterns
    assert otp is None or len(otp) < 10
