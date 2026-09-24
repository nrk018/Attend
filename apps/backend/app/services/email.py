import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import resend
from app.config import get_settings

logger = logging.getLogger(__name__)


def generate_verification_token() -> str:
    return secrets.token_urlsafe(32)


def _verify_url(token: str) -> str:
    settings = get_settings()
    base = settings.app_base_url.rstrip("/")
    # Local backend is HTTP only. Mail/Safari often rewrite localhost links to https.
    if "localhost" in base or "127.0.0.1" in base:
        base = base.replace("https://", "http://", 1)
    return f"{base}/api/v1/auth/verify-email?token={token}"


def send_verification_email(email: str, token: str) -> tuple[bool, str]:
    """Send email verification link via Resend. Returns (success, error_message)."""
    settings = get_settings()
    if not settings.resend_api_key:
        return False, "RESEND_API_KEY is not configured. Add it to .env"
    resend.api_key = settings.resend_api_key
    verify_url = _verify_url(token)
    params = {
        "from": settings.resend_from_email,
        "to": [email],
        "subject": "Verify your Attend email",
        "html": f"""
        <p>Thanks for signing up for Attend!</p>
        <p>Click the link below to verify your email address:</p>
        <p><a href="{verify_url}">{verify_url}</a></p>
        <p>This link expires in 24 hours.</p>
        <p>On a development machine, open the link in a browser as <strong>http://</strong> (not https). Safari may show a secure-connection error if it upgrades localhost to https.</p>
        <p>If you didn't create an account, you can ignore this email.</p>
        """,
    }
    try:
        resend.Emails.send(params)
        return True, ""
    except Exception as e:
        err_msg = str(e)
        logger.exception("Resend send_verification_email failed: %s", err_msg)
        if "only send testing emails to your own email" in err_msg.lower() or "verify a domain" in err_msg.lower():
            err_msg = (
                "Resend requires a verified domain to send to external emails. "
                "Verify your domain at https://resend.com/domains and set the 'from' address in email.py to use it."
            )
        return False, err_msg


def send_super_admin_welcome_email(email: str, token: str, college_name: str) -> tuple[bool, str]:
    """Send welcome + verification email when Platform Admin adds a Super Admin. Returns (success, error_message)."""
    settings = get_settings()
    if not settings.resend_api_key:
        return False, "RESEND_API_KEY is not configured. Add it to .env"
    resend.api_key = settings.resend_api_key
    verify_url = _verify_url(token)
    params = {
        "from": settings.resend_from_email,
        "to": [email],
        "subject": f"Welcome to Attend – Super Admin for {college_name}",
        "html": f"""
        <p>Hello,</p>
        <p>You have been added as <strong>Super Admin</strong> of <strong>{college_name}</strong> on Attend – the attendance automation platform.</p>
        <p>To get started, please verify your email address by clicking the link below:</p>
        <p><a href="{verify_url}" style="display:inline-block;background:#007AFF;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">Verify Email</a></p>
        <p style="color:#666;font-size:14px;">Or copy this link: {verify_url}</p>
        <p>This link expires in 24 hours.</p>
        <p>Once verified, you can log in via the Attend mobile app to manage your college.</p>
        <p>— The Attend Team</p>
        """,
    }
    try:
        resend.Emails.send(params)
        return True, ""
    except Exception as e:
        err_msg = str(e)
        logger.exception("Resend send_super_admin_welcome_email failed: %s", err_msg)
        if "only send testing emails to your own email" in err_msg.lower() or "verify a domain" in err_msg.lower():
            err_msg = (
                "Resend requires a verified domain to send to external emails. "
                "Verify your domain at https://resend.com/domains and set the 'from' address in email.py to use it."
            )
        return False, err_msg


def verification_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=24)


def parse_timestamptz(value) -> Optional[datetime]:
    """Parse Postgres/Supabase timestamps, including 1–6 fractional digits."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip().replace("Z", "+00:00")
        if "." in text:
            date_part, rest = text.split(".", 1)
            digits = []
            tz = []
            for ch in rest:
                if ch.isdigit() and not tz:
                    digits.append(ch)
                else:
                    tz.append(ch)
            frac = "".join(digits)[:6].ljust(6, "0")
            text = f"{date_part}.{frac}{''.join(tz)}"
        dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _send(to: str, subject: str, html: str, from_email: Optional[str] = None, _retried: bool = False) -> tuple[bool, str]:
    settings = get_settings()
    if not settings.resend_api_key:
        return False, "RESEND_API_KEY is not configured. Add it to .env"
    resend.api_key = settings.resend_api_key
    sender = (from_email or settings.resend_from_email or "").strip().strip('"')
    try:
        resend.Emails.send({
            "from": sender,
            "to": [to],
            "subject": subject,
            "html": html,
        })
        return True, ""
    except Exception as e:
        err_msg = str(e)
        logger.exception("Resend send failed: %s", e)
        if not _retried and "domain is not verified" in err_msg.lower():
            return _send(to, subject, html, from_email="Attend <onboarding@resend.dev>", _retried=True)
        return False, err_msg


def send_student_verify_email(email: str, token: str, name: str, reg_no: str) -> tuple[bool, str]:
    settings = get_settings()
    base = settings.student_web_url.rstrip("/")
    if "localhost" in base or "127.0.0.1" in base:
        base = base.replace("https://", "http://", 1)
    url = f"{base}/verify?token={token}"
    return _send(
        email,
        "Verify your Attend registration",
        f"""
        <p>Hello {name},</p>
        <p>Confirm your registration number <strong>{reg_no}</strong> by opening this link:</p>
        <p><a href="{url}">{url}</a></p>
        <p>This link expires in 24 hours. After you verify, upload your ID card and face photos.</p>
        """,
    )


def send_student_enrolled_email(email: str, name: str, reg_no: str, department_name: str) -> tuple[bool, str]:
    return _send(
        email,
        "Attend registration complete",
        f"""
        <p>Hello {name},</p>
        <p>Your face registration is complete.</p>
        <p>Registration number: <strong>{reg_no}</strong><br/>Department: <strong>{department_name}</strong></p>
        <p>You can now be marked present in class.</p>
        """,
    )
