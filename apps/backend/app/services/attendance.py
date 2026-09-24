"""
Attendance: recognize faces, confirm, save.
"""
import base64
import re
import uuid
import cv2
from datetime import date, datetime
from typing import List, Optional

from app.config import get_settings
from app.db.supabase import get_supabase
from app.face.pipeline import detect_and_embed, decode_image, crop_face
from app.face.faiss_index import get_or_build_college_index, search_index


# In-memory session for live stream: session_id -> set(student_ids)
_stream_sessions: dict = {}


def _get_enrolled_student_ids(supabase, subject_id: str) -> Optional[set]:
    """If subject has enrolled students, return their ids. Otherwise None (allow all)."""
    r = supabase.table("subject_students").select("student_id").eq("subject_id", subject_id).execute()
    if not r.data:
        return None
    ids = {str(row["student_id"]) for row in r.data}
    return ids if ids else None


def _get_section_student_ids(supabase, section_id: str) -> Optional[set]:
    """Get student IDs enrolled in a specific section."""
    r = supabase.table("section_students").select("student_id").eq("section_id", section_id).execute()
    if not r.data:
        return None
    ids = {str(row["student_id"]) for row in r.data}
    return ids if ids else None


def recognize_faces(
    image_bytes: bytes,
    college_id: str,
    subject_id: Optional[str] = None,
    section_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> tuple[List[dict], int, int]:
    """
    Recognize faces in image. Returns list of matches with student_id, name, confidence, etc.
    When section_id is provided, only returns matches for students in that section.
    Falls back to subject_id filtering if no section_id but subject has enrolled students.
    """
    supabase = get_supabase()
    index, id_list = get_or_build_college_index(supabase, college_id)
    if index is None or not id_list:
        return [], 0, 0

    enrolled_ids = None
    if section_id:
        enrolled_ids = _get_section_student_ids(supabase, section_id)
    elif subject_id:
        enrolled_ids = _get_enrolled_student_ids(supabase, subject_id)

    img = decode_image(image_bytes)
    faces = detect_and_embed(img)
    results = []
    seen_students = _stream_sessions.get(session_id, set()) if session_id else set()

    threshold = get_settings().recognition_threshold
    for f in faces:
        matches = search_index(index, id_list, f["embedding"], k=1, threshold=threshold)
        if not matches:
            results.append({
                "student_id": None,
                "student_name": None,
                "reg_no": None,
                "confidence": 0,
                "reference_image_url": None,
                "face_crop_base64": _crop_to_base64(img, f["bbox"]),
                "bbox": f["bbox"],
                "unknown": True,
            })
            continue

        student_id, score = matches[0]
        if enrolled_ids is not None and student_id not in enrolled_ids:
            results.append({
                "student_id": None,
                "student_name": None,
                "reg_no": None,
                "confidence": 0,
                "reference_image_url": None,
                "face_crop_base64": _crop_to_base64(img, f["bbox"]),
                "bbox": f["bbox"],
                "unknown": True,
            })
            continue
        if session_id and student_id in seen_students:
            continue  # Skip duplicate in stream mode (one entry per user per session)

        # Fetch student details
        student = supabase.table("students").select("id, name, reg_no, primary_image_url").eq("id", student_id).execute()
        if not student.data:
            continue
        s = student.data[0]

        results.append({
            "student_id": str(s["id"]),
            "student_name": s["name"],
            "reg_no": s["reg_no"],
            "confidence": score,
            "reference_image_url": s.get("primary_image_url"),
            "face_crop_base64": _crop_to_base64(img, f["bbox"]),
            "bbox": f["bbox"],
            "unknown": False,
        })

        if session_id:
            seen_students.add(student_id)

    if session_id:
        _stream_sessions[session_id] = seen_students

    h, w = img.shape[:2]
    return results, h, w


def _crop_to_base64(img, bbox) -> str:
    crop = crop_face(img, bbox)
    _, buf = cv2.imencode(".jpg", crop)
    return base64.b64encode(buf).decode("utf-8")


def _decode_crop(face_crop_base64: str) -> Optional[bytes]:
    raw = face_crop_base64.strip()
    if raw.lower().startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        data = base64.b64decode(raw, validate=False)
        return data or None
    except Exception:
        return None


def _existing_in_class(supabase, class_id: str, student_id: str) -> Optional[dict]:
    result = (
        supabase.table("attendance")
        .select("*")
        .eq("class_id", class_id)
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _existing_attendance(supabase, student_id: str, subject_id: str, attendance_date: str) -> Optional[dict]:
    result = (
        supabase.table("attendance")
        .select("*")
        .eq("student_id", student_id)
        .eq("subject_id", subject_id)
        .eq("attendance_date", attendance_date)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _is_duplicate_attendance(err: Exception) -> bool:
    msg = str(err).lower()
    return (
        "unique_class_student" in msg
        or "unique_student_subject_date" in msg
        or "duplicate" in msg
        or "23505" in str(err)
    )


def _upload_face_crop(
    supabase,
    subject_id: str,
    student_id: str,
    face_crop_base64: Optional[str],
    section_id: Optional[str] = None,
    class_id: Optional[str] = None,
) -> Optional[str]:
    crop_bytes = _decode_crop(face_crop_base64) if face_crop_base64 else None
    if not crop_bytes:
        return None
    try:
        bucket = get_settings().bucket_attendance_crops
        folder = class_id or section_id or "general"
        path = f"attendance/{subject_id}/{folder}/{student_id}/{uuid.uuid4()}.jpg"
        supabase.storage.from_(bucket).upload(
            path, crop_bytes, file_options={"content-type": "image/jpeg"}
        )
        return supabase.storage.from_(bucket).get_public_url(path)
    except Exception:
        return None


def save_attendance(
    student_id: str,
    subject_id: str,
    confidence: float,
    section_id: Optional[str] = None,
    face_crop_base64: Optional[str] = None,
    class_id: Optional[str] = None,
    source: str = "face",
) -> dict:
    """Save attendance. Unique per class+student when class_id is set."""
    supabase = get_supabase()
    attendance_date = date.today().isoformat()
    if class_id:
        cls = supabase.table("attendance_classes").select("*").eq("id", class_id).limit(1).execute()
        if not cls.data:
            raise ValueError("Class not found")
        row = cls.data[0]
        attendance_date = str(row["class_date"])[:10]
        subject_id = row["subject_id"]
        section_id = section_id or row.get("section_id")
        existing = _existing_in_class(supabase, class_id, student_id)
        if existing:
            return existing
    else:
        existing = _existing_attendance(supabase, student_id, subject_id, attendance_date)
        if existing:
            return existing

    face_crop_url = _upload_face_crop(
        supabase, subject_id, student_id, face_crop_base64, section_id, class_id
    )

    record = {
        "student_id": student_id,
        "subject_id": subject_id,
        "attendance_date": attendance_date,
        "timestamp": datetime.now().isoformat(),
        "confidence": float(confidence),
        "face_crop_url": face_crop_url,
        "source": source if source in ("face", "manual") else "face",
    }
    if section_id:
        record["section_id"] = section_id
    if class_id:
        record["class_id"] = class_id

    try:
        result = supabase.table("attendance").insert(record).execute()
    except Exception as e:
        if _is_duplicate_attendance(e):
            if class_id:
                existing = _existing_in_class(supabase, class_id, student_id)
            else:
                existing = _existing_attendance(supabase, student_id, subject_id, attendance_date)
            if existing:
                return existing
        raise
    return result.data[0] if result.data else {}


def next_period_name(supabase, subject_id: str, section_id: Optional[str], class_date: str) -> str:
    q = (
        supabase.table("attendance_classes")
        .select("name")
        .eq("subject_id", subject_id)
        .eq("class_date", class_date)
    )
    if section_id:
        q = q.eq("section_id", section_id)
    else:
        q = q.is_("section_id", "null")
    rows = q.execute().data or []
    return f"Period {len(rows) + 1}"


def _class_select_columns(embed: bool) -> str:
    base = "id, subject_id, section_id, class_date, name, created_at, created_by"
    if embed:
        return base + ", sections(name), subjects(name)"
    return base


def list_classes(
    subject_id: str,
    section_id: Optional[str] = None,
    class_date: Optional[str] = None,
) -> list:
    supabase = get_supabase()
    section_id = section_id or None
    rows = []
    last_err = None
    for embed in (True, False):
        try:
            q = (
                supabase.table("attendance_classes")
                .select(_class_select_columns(embed))
                .eq("subject_id", subject_id)
                .order("created_at", desc=False)
            )
            if section_id:
                q = q.eq("section_id", section_id)
            if class_date:
                q = q.eq("class_date", class_date)
            rows = q.execute().data or []
            last_err = None
            break
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    counts = {}
    try:
        att = (
            supabase.table("attendance")
            .select("class_id")
            .in_("class_id", ids)
            .execute()
            .data
            or []
        )
        for a in att:
            cid = a.get("class_id")
            if cid:
                counts[cid] = counts.get(cid, 0) + 1
    except Exception:
        counts = {}
    out = []
    for r in rows:
        section = r.pop("sections", None) or {}
        subject = r.pop("subjects", None) or {}
        if isinstance(section, list):
            section = section[0] if section else {}
        if isinstance(subject, list):
            subject = subject[0] if subject else {}
        r["section_name"] = section.get("name")
        r["subject_name"] = subject.get("name")
        r["present_count"] = counts.get(r["id"], 0)
        out.append(r)
    if class_date:
        return [row for row in out if str(row.get("class_date") or "")[:10] == class_date]
    out.sort(key=lambda row: (str(row.get("class_date") or ""), str(row.get("created_at") or "")), reverse=True)
    return out


def create_class(
    subject_id: str,
    class_date: str,
    section_id: Optional[str] = None,
    name: Optional[str] = None,
    created_by: Optional[str] = None,
) -> dict:
    supabase = get_supabase()
    section_id = section_id or None
    created_by = created_by or None
    period = (name or "").strip() or next_period_name(supabase, subject_id, section_id, class_date)
    payload = {
        "subject_id": subject_id,
        "class_date": class_date,
        "name": period,
    }
    if section_id:
        payload["section_id"] = section_id
    if created_by:
        payload["created_by"] = created_by
    try:
        result = supabase.table("attendance_classes").insert(payload).execute()
    except Exception:
        payload.pop("created_by", None)
        result = supabase.table("attendance_classes").insert(payload).execute()
    if not result.data:
        raise ValueError("Failed to create class")
    row = result.data[0]
    row["present_count"] = 0
    return row


def get_class(class_id: str) -> Optional[dict]:
    supabase = get_supabase()
    row = None
    last_err = None
    for cols in (
        "id, subject_id, section_id, class_date, name, created_at, created_by, sections(name), subjects(name)",
        "id, subject_id, section_id, class_date, name, created_at, created_by",
    ):
        try:
            cls = (
                supabase.table("attendance_classes")
                .select(cols)
                .eq("id", class_id)
                .limit(1)
                .execute()
            )
            last_err = None
            if not cls.data:
                return None
            row = cls.data[0]
            break
        except Exception as e:
            last_err = e
            continue
    if last_err:
        raise last_err
    if not row:
        return None
    section = row.pop("sections", None) or {}
    subject = row.pop("subjects", None) or {}
    if isinstance(section, list):
        section = section[0] if section else {}
    if isinstance(subject, list):
        subject = subject[0] if subject else {}
    row["section_name"] = section.get("name")
    row["subject_name"] = subject.get("name")
    records = None
    last_rec_err = None
    record_selects = (
        "id, student_id, subject_id, section_id, class_id, timestamp, attendance_date, "
        "confidence, face_crop_url, source, students(reg_no, name, primary_image_url)",
        "id, student_id, subject_id, section_id, class_id, timestamp, attendance_date, "
        "confidence, face_crop_url, source, students(reg_no, name)",
        "id, student_id, subject_id, section_id, class_id, timestamp, attendance_date, "
        "confidence, face_crop_url, source",
        "id, student_id, subject_id, section_id, timestamp, attendance_date, confidence, face_crop_url",
    )
    for cols in record_selects:
        try:
            records = (
                supabase.table("attendance")
                .select(cols)
                .eq("class_id", class_id)
                .order("timestamp", desc=False)
                .execute()
                .data
                or []
            )
            last_rec_err = None
            break
        except Exception as e:
            last_rec_err = e
            continue
    if records is None:
        raise last_rec_err or RuntimeError("Could not load class attendance")
    row["present_count"] = len(records)
    row["records"] = records
    return row


def save_class_roster(class_id: str, records: list) -> dict:
    """Upsert the class present list. Students omitted from the payload are removed."""
    supabase = get_supabase()
    cls = supabase.table("attendance_classes").select("*").eq("id", class_id).limit(1).execute()
    if not cls.data:
        raise ValueError("Class not found")
    class_row = cls.data[0]
    subject_id = class_row["subject_id"]
    section_id = class_row.get("section_id")
    incoming_ids = []
    seen = set()
    saved = []
    errors = []
    for r in records:
        sid = r.get("student_id")
        if not sid or sid in seen:
            continue
        seen.add(sid)
        incoming_ids.append(str(sid))
        source = r.get("source") or ("face" if r.get("face_crop_base64") else "manual")
        try:
            conf = r.get("confidence")
            try:
                conf_val = float(conf) if conf is not None else 1.0
                if conf_val != conf_val:
                    conf_val = 1.0
            except (TypeError, ValueError):
                conf_val = 1.0
            existing = _existing_in_class(supabase, class_id, sid)
            if existing:
                updates = {}
                crop_url = _upload_face_crop(
                    supabase, subject_id, sid, r.get("face_crop_base64"), section_id, class_id
                )
                if crop_url:
                    updates["face_crop_url"] = crop_url
                    updates["source"] = "face"
                if r.get("confidence") is not None:
                    updates["confidence"] = conf_val
                if updates:
                    supabase.table("attendance").update(updates).eq("id", existing["id"]).execute()
                    existing.update(updates)
                saved.append(existing)
            else:
                saved.append(
                    save_attendance(
                        student_id=str(sid),
                        subject_id=subject_id,
                        confidence=conf_val,
                        section_id=section_id,
                        face_crop_base64=r.get("face_crop_base64"),
                        class_id=class_id,
                        source=source,
                    )
                )
        except Exception as e:
            errors.append(e)
            continue
    if incoming_ids and not saved:
        raise errors[0] if errors else RuntimeError("Could not save students")

    existing_rows = (
        supabase.table("attendance").select("id, student_id, face_crop_url").eq("class_id", class_id).execute().data
        or []
    )
    incoming_set = set(incoming_ids)
    bucket = get_settings().bucket_attendance_crops
    for row in existing_rows:
        if str(row["student_id"]) in incoming_set:
            continue
        path = None
        url = row.get("face_crop_url")
        if url:
            m = re.search(r"/attendance-crops/(.+)$", url)
            path = m.group(1) if m else None
        if path:
            try:
                supabase.storage.from_(bucket).remove([path])
            except Exception:
                pass
        supabase.table("attendance").delete().eq("id", row["id"]).execute()

    return {"saved": len(saved), "records": saved, "class_id": class_id}


def add_manual_student(class_id: str, student_id: str) -> dict:
    return save_attendance(
        student_id=student_id,
        subject_id="",
        confidence=1.0,
        class_id=class_id,
        source="manual",
    )


def remove_class_student(class_id: str, student_id: str) -> None:
    supabase = get_supabase()
    row = (
        supabase.table("attendance")
        .select("id, face_crop_url")
        .eq("class_id", class_id)
        .eq("student_id", student_id)
        .execute()
    )
    bucket = get_settings().bucket_attendance_crops
    for rec in row.data or []:
        url = rec.get("face_crop_url")
        if url:
            m = re.search(r"/attendance-crops/(.+)$", url)
            path = m.group(1) if m else None
            if path:
                try:
                    supabase.storage.from_(bucket).remove([path])
                except Exception:
                    pass
        supabase.table("attendance").delete().eq("id", rec["id"]).execute()


def delete_class(class_id: str) -> int:
    supabase = get_supabase()
    rows = supabase.table("attendance").select("id, face_crop_url").eq("class_id", class_id).execute()
    bucket = get_settings().bucket_attendance_crops
    for rec in rows.data or []:
        url = rec.get("face_crop_url")
        if url:
            m = re.search(r"/attendance-crops/(.+)$", url)
            path = m.group(1) if m else None
            if path:
                try:
                    supabase.storage.from_(bucket).remove([path])
                except Exception:
                    pass
    supabase.table("attendance").delete().eq("class_id", class_id).execute()
    supabase.table("attendance_classes").delete().eq("id", class_id).execute()
    return len(rows.data or [])


def create_stream_session() -> str:
    """Create new stream session for live mode."""
    sid = str(uuid.uuid4())
    _stream_sessions[sid] = set()
    return sid


def clear_stream_session(session_id: str):
    """Clear stream session when done."""
    if session_id in _stream_sessions:
        del _stream_sessions[session_id]
