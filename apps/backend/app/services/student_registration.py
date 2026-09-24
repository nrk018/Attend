from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np

from app.auth.jwt import create_access_token, decode_token
from app.config import get_settings
from app.db.supabase import get_supabase, reset_supabase
from app.face.pipeline import decode_image, detect_and_embed
from app.services.email import generate_verification_token, parse_timestamptz, send_student_enrolled_email, send_student_verify_email, verification_expires_at
from app.services.enrollment import enroll_existing_student, read_match_score, store_match_score


def cosine(a, b) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def best_embedding(image_bytes: bytes, label: str):
    faces = detect_and_embed(decode_image(image_bytes))
    if not faces:
        raise ValueError(f"No clear face found in the {label}")
    return max(faces, key=lambda f: f["det_score"])["embedding"]


def lookup_and_send_verify(college_id: str, reg_no: str) -> dict:
    def _query():
        client = get_supabase()
        return (
            client.table("students")
            .select("id, name, email, enrollment_status, email_verification_token")
            .eq("college_id", college_id)
            .eq("reg_no", reg_no.strip())
            .execute()
        )

    try:
        result = _query()
    except Exception:
        reset_supabase()
        result = _query()
    supabase = get_supabase()
    found = len(result.data or [])
    if not result.data:
        return {"status": "sent"}
    student = result.data[0]
    if str(student.get("enrollment_status") or "").strip().lower() == "enrolled":
        return {"status": "already_enrolled"}
    email = student.get("email")
    if not email:
        return {"status": "sent"}
    token = student.get("email_verification_token") or generate_verification_token()
    supabase.table("students").update({
        "email_verification_token": token,
        "email_verification_expires_at": verification_expires_at().isoformat(),
    }).eq("id", student["id"]).execute()
    sent_ok, send_err = send_student_verify_email(email, token, student.get("name") or "Student", reg_no.strip())
    if sent_ok:
        return {"status": "sent"}
    settings = get_settings()
    base = settings.student_web_url.rstrip("/")
    if "localhost" in base or "127.0.0.1" in base:
        base = base.replace("https://", "http://", 1)
        verify_url = f"{base}/verify?token={token}"
        return {
            "status": "sent",
            "verify_url": verify_url,
            "email_warning": "Verification email could not be sent. Open the link below to continue.",
        }
    raise ValueError("Could not send the verification email. Try again shortly.")


def verify_email_token(token: str) -> dict:
    if not token or not token.strip():
        raise ValueError("Invalid or expired verification link")
    supabase = get_supabase()
    result = (
        supabase.table("students")
        .select("id, name, reg_no, enrollment_status, email_verification_expires_at")
        .eq("email_verification_token", token.strip())
        .execute()
    )
    if not result.data:
        raise ValueError("Invalid or expired verification link")
    student = result.data[0]
    if str(student.get("enrollment_status") or "").strip().lower() == "enrolled":
        raise ValueError("This student is already enrolled")
    exp = parse_timestamptz(student.get("email_verification_expires_at"))
    if exp and exp < datetime.now(timezone.utc):
        raise ValueError("Invalid or expired verification link")
    supabase.table("students").update({
        "email_verified": True,
        "enrollment_status": "email_verified",
    }).eq("id", student["id"]).execute()
    session = create_access_token(
        {"student_id": str(student["id"]), "typ": "student_reg"},
        expires_delta=timedelta(hours=2),
    )
    return {
        "session_token": session,
        "student": {
            "id": str(student["id"]),
            "name": student.get("name"),
            "reg_no": student.get("reg_no"),
        },
    }


def preview_id_jpeg(image_bytes: bytes) -> bytes:
    import cv2
    img = decode_image(image_bytes)
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        raise ValueError("Could not preview that image")
    return buf.tobytes()


def student_id_from_session(token: str) -> str:
    payload = decode_token(token)
    if not payload or payload.get("typ") != "student_reg" or not payload.get("student_id"):
        raise ValueError("Invalid registration session")
    return str(payload["student_id"])


def save_id_card(student_id: str, image_bytes: bytes) -> dict:
    import cv2

    supabase = get_supabase()
    row = supabase.table("students").select("id, college_id, enrollment_status, email_verified, name, reg_no").eq("id", student_id).execute()
    if not row.data:
        raise ValueError("Student not found")
    student = row.data[0]
    if student.get("enrollment_status") == "enrolled":
        raise ValueError("Student is already enrolled")
    if not student.get("email_verified"):
        raise ValueError("Verify your email first")
    img = decode_image(image_bytes)
    faces = detect_and_embed(img)
    if not faces:
        raise ValueError("No clear face found in the ID card")
    best = max(faces, key=lambda f: f["det_score"])
    emb = best["embedding"]
    height, width = img.shape[:2]
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    jpeg_bytes = buf.tobytes() if ok else image_bytes
    from app.services.id_card_ocr import match_id_card_text
    try:
        text = match_id_card_text(img, student.get("name") or "", student.get("reg_no") or "")
    except Exception as ocr_exc:
        text = {"ocr_name": "", "ocr_reg_no": "", "name_match": False, "reg_match": False, "text_match": False, "line_count": 0}
    detect = {
        "status": "ok" if text.get("text_match") else "text_mismatch",
        "bbox": [round(float(x), 1) for x in best["bbox"]],
        "image_width": int(width),
        "image_height": int(height),
        "det_score": float(best["det_score"]),
        "ocr_name": text.get("ocr_name") or "",
        "ocr_reg_no": text.get("ocr_reg_no") or "",
        "name_match": bool(text.get("name_match")),
        "reg_match": bool(text.get("reg_match")),
        "text_match": bool(text.get("text_match")),
    }
    if not text.get("text_match"):
        return {**detect, "id_card_url": None}

    def _write():
        client = get_supabase()
        from app.services.enrollment import _store_id_card_embedding, _upload_face
        college_id = str(student["college_id"])
        bucket = get_settings().bucket_primary_faces
        url = _upload_face(client, bucket, f"{college_id}/{student_id}/id.jpg", jpeg_bytes)
        client.table("students").update({"id_card_url": url}).eq("id", student_id).execute()
        pose = _store_id_card_embedding(client, student_id, emb)
        return {**detect, "id_card_url": url}

    try:
        out = _write()
        return out
    except Exception as first:
        reset_supabase()
        try:
            out = _write()
            return out
        except Exception as exc:
            raise RuntimeError("Could not save the ID card. Try again.") from exc


def _id_card_embedding(supabase, student_id: str) -> Optional[list]:
    row = None
    for pose in ("id_card", "front"):
        row = (
            supabase.table("face_embeddings")
            .select("embedding")
            .eq("student_id", student_id)
            .eq("pose", pose)
            .execute()
        )
        if row.data:
            break
    if not row or not row.data:
        return None
    emb = row.data[0]["embedding"]
    if isinstance(emb, list):
        return [float(x) for x in emb]
    import json
    if isinstance(emb, str):
        try:
            return [float(x) for x in json.loads(emb)]
        except json.JSONDecodeError:
            return [float(x) for x in emb.strip("[]").split(",") if x]
    return None


def compare_live_to_id(student_id: str, image_bytes: bytes) -> dict:
    supabase = get_supabase()
    id_emb = _id_card_embedding(supabase, student_id)
    if id_emb is None:
        raise ValueError("Upload your ID card first")
    live = best_embedding(image_bytes, "live photo")
    score = cosine(id_emb, live)
    threshold = get_settings().recognition_threshold
    return {
        "score": score,
        "threshold": threshold,
        "auto_threshold": get_settings().auto_enroll_threshold,
        "match": score >= threshold,
        "auto_enroll": score >= get_settings().auto_enroll_threshold,
    }


def submit_live_faces(student_id: str, front: bytes, left: bytes, right: bytes) -> dict:
    supabase = get_supabase()
    row = (
        supabase.table("students")
        .select("id, name, reg_no, email, college_id, department_id, enrollment_status, email_verified, departments(name)")
        .eq("id", student_id)
        .execute()
    )
    if not row.data:
        raise ValueError("Student not found")
    student = row.data[0]
    if student.get("enrollment_status") == "enrolled":
        raise ValueError("Student is already enrolled")
    if not student.get("email_verified"):
        raise ValueError("Verify your email first")

    id_emb = _id_card_embedding(supabase, student_id)
    if id_emb is None:
        raise ValueError("Upload your ID card first")

    front_emb = best_embedding(front, "front photo")
    left_emb = best_embedding(left, "left photo")
    right_emb = best_embedding(right, "right photo")
    auto_threshold = get_settings().auto_enroll_threshold
    scores = {
        "id_front": cosine(id_emb, front_emb),
        "front_left": cosine(front_emb, left_emb),
        "front_right": cosine(front_emb, right_emb),
        "left_right": cosine(left_emb, right_emb),
    }
    min_score = min(scores.values())
    finalize = min_score >= auto_threshold
    result = enroll_existing_student(
        student_id=student_id,
        front_image_bytes=front,
        left_image_bytes=left,
        right_image_bytes=right,
        finalize=finalize,
        match_score=min_score,
    )
    if not finalize:
        return {**result, "scores": scores, "status": "pending_approval", "needs_approval": True}
    dept = student.get("departments") or {}
    if isinstance(dept, list):
        dept = dept[0] if dept else {}
    if student.get("email"):
        send_student_enrolled_email(
            student["email"],
            student.get("name") or "Student",
            student.get("reg_no") or "",
            dept.get("name") or "your department",
        )
    return {**result, "scores": scores, "status": "enrolled", "needs_approval": False}


def list_pending_enrollments(college_id: str) -> list:
    supabase = get_supabase()
    columns = "id, name, reg_no, email, college_id, department_id, enrollment_status, id_card_url, primary_image_url, left_image_url, right_image_url, departments(name)"
    try:
        result = (
            supabase.table("students")
            .select(columns + ", face_match_score")
            .eq("college_id", college_id)
            .eq("enrollment_status", "pending_approval")
            .order("name")
            .execute()
        )
    except Exception:
        result = (
            supabase.table("students")
            .select(columns)
            .eq("college_id", college_id)
            .eq("enrollment_status", "pending_approval")
            .order("name")
            .execute()
        )
    rows = result.data or []
    for row in rows:
        dept = row.pop("departments", None)
        row["department_name"] = dept.get("name") if isinstance(dept, dict) else None
        row["id"] = str(row["id"])
        row["college_id"] = str(row["college_id"]) if row.get("college_id") else None
        row["department_id"] = str(row["department_id"]) if row.get("department_id") else None
        stored = None
        if row.get("college_id"):
            stored = read_match_score(str(row["college_id"]), row["id"])
        if stored is not None:
            row["face_match_score"] = stored
        elif row.get("face_match_score") is not None and float(row["face_match_score"]) >= 0.99:
            row["face_match_score"] = None
    return rows


def approve_pending_enrollment(student_id: str, college_id: str) -> dict:
    supabase = get_supabase()
    row = (
        supabase.table("students")
        .select("id, name, reg_no, email, college_id, enrollment_status, departments(name)")
        .eq("id", student_id)
        .execute()
    )
    if not row.data:
        raise ValueError("Student not found")
    student = row.data[0]
    if str(student.get("college_id")) != str(college_id):
        raise ValueError("Cannot approve a student outside your college")
    if student.get("enrollment_status") != "pending_approval":
        raise ValueError("This student is not waiting for approval")
    supabase.table("students").update({"enrollment_status": "enrolled"}).eq("id", student_id).execute()
    from app.face.faiss_index import invalidate_college_index
    invalidate_college_index(str(student["college_id"]))
    dept = student.get("departments") or {}
    if isinstance(dept, list):
        dept = dept[0] if dept else {}
    if student.get("email"):
        send_student_enrolled_email(
            student["email"],
            student.get("name") or "Student",
            student.get("reg_no") or "",
            dept.get("name") or "your department",
        )
    return {"id": str(student["id"]), "enrollment_status": "enrolled"}


def deny_pending_enrollment(student_id: str, college_id: str) -> dict:

    def _do():
        client = get_supabase()
        row = (
            client.table("students")
            .select("id, college_id, enrollment_status")
            .eq("id", student_id)
            .execute()
        )
        if not row.data:
            raise ValueError("Student not found")
        student = row.data[0]
        if str(student.get("college_id")) != str(college_id):
            raise ValueError("Cannot deny a student outside your college")
        status = student.get("enrollment_status")
        if status == "enrolled":
            raise ValueError("This student is already enrolled")
        if status != "pending_approval":
            return {"id": str(student["id"]), "enrollment_status": status or "email_verified"}
        client.table("students").update({"enrollment_status": "email_verified"}).eq("id", student_id).execute()
        clear_review_photo_cache(student_id)
        return {"id": str(student["id"]), "enrollment_status": "email_verified"}

    try:
        out = _do()
    except ValueError:
        raise
    except Exception as first:
        reset_supabase()
        try:
            out = _do()
        except ValueError:
            raise
        except Exception as exc:
            raise RuntimeError("Could not deny this student. Try again.") from exc
    return out


_review_photo_cache: dict[tuple[str, str], bytes] = {}


def clear_review_photo_cache(student_id: str) -> None:
    for kind in ("id", "front", "left", "right"):
        _review_photo_cache.pop((student_id, kind), None)


def _thumb_jpeg(raw: bytes, max_side: int = 480) -> bytes:
    import cv2
    import numpy as np
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return raw
    height, width = img.shape[:2]
    if max(height, width) > max_side:
        scale = max_side / max(height, width)
        img = cv2.resize(img, (int(width * scale), int(height * scale)))
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    return buf.tobytes() if ok else raw


def review_photo_bytes(student_id: str, college_id: str, kind: str) -> bytes:
    names = {"id": "id.jpg", "front": "primary.jpg", "left": "left.jpg", "right": "right.jpg"}
    filename = names.get(kind)
    if not filename:
        raise ValueError("Unknown photo")
    cached = _review_photo_cache.get((student_id, kind))
    if cached:
        return cached
    path = f"{college_id}/{student_id}/{filename}"
    bucket = get_settings().bucket_primary_faces
    try:
        data = get_supabase().storage.from_(bucket).download(path)
    except Exception:
        reset_supabase()
        data = get_supabase().storage.from_(bucket).download(path)
    raw = data if isinstance(data, bytes) else bytes(data or b"")
    if len(raw) < 32:
        raise ValueError("Photo not found")
    thumb = _thumb_jpeg(raw)
    _review_photo_cache[(student_id, kind)] = thumb
    return thumb
