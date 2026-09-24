from typing import List, Optional
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.auth.deps import get_current_user, require_teacher, require_dept_admin
from app.config import get_settings
from app.db.supabase import get_supabase, reset_supabase
from app.services.attendance import (
    save_attendance,
    list_classes,
    create_class,
    get_class,
    save_class_roster,
    add_manual_student,
    remove_class_student,
    delete_class,
)
from pydantic import BaseModel, field_validator
import io
import pandas as pd
from datetime import datetime

router = APIRouter()

SCHEMA_HINT = (
    "Database is missing attendance classes. "
    "Run apps/backend/migrations/003_attendance_classes.sql in the Supabase SQL Editor."
)


def _is_schema_error(err: Exception) -> bool:
    msg = str(err).lower()
    return "attendance_classes" in msg or "pgrst205" in msg or "class_id does not exist" in msg


def _extract_storage_path(face_crop_url: Optional[str]) -> Optional[str]:
    """Extract storage path from face_crop_url for bucket deletion."""
    if not face_crop_url:
        return None
    m = re.search(r"/attendance-crops/(.+)$", face_crop_url)
    return m.group(1) if m else None


def _teacher_subject_ids(supabase, user: dict) -> set:
    user_id = user.get("user_id") or user.get("sub")
    st = supabase.table("subject_teachers").select("subject_id").eq("teacher_id", user_id).execute()
    ids = {r["subject_id"] for r in (st.data or [])}
    assigned = (
        supabase.table("section_teachers").select("section_id").eq("teacher_id", user_id).execute()
    )
    section_ids = [r["section_id"] for r in (assigned.data or []) if r.get("section_id")]
    if section_ids:
        secs = supabase.table("sections").select("subject_id").in_("id", section_ids).execute()
        ids |= {r["subject_id"] for r in (secs.data or []) if r.get("subject_id")}
    return ids


def _check_subject_access(supabase, user: dict, subject_id: str) -> None:
    """Raise 403 if user cannot access this subject."""
    role = user.get("role")
    if role == "DEPARTMENT_ADMIN":
        subj = supabase.table("subjects").select("department_id").eq("id", subject_id).execute()
        if not subj.data or str(user.get("department_id")) != str(subj.data[0].get("department_id")):
            raise HTTPException(status_code=403, detail="Cannot access this subject")
    elif role == "TEACHER":
        if subject_id not in _teacher_subject_ids(supabase, user):
            raise HTTPException(status_code=403, detail="Cannot access this subject")
    else:
        raise HTTPException(status_code=403, detail="Cannot access this subject")


class AttendanceRecord(BaseModel):
    student_id: str
    subject_id: str
    confidence: float
    section_id: Optional[str] = None
    face_crop_base64: Optional[str] = None
    class_id: Optional[str] = None
    source: Optional[str] = "face"


class ConfirmAttendanceRequest(BaseModel):
    records: List[AttendanceRecord]


class CreateClassRequest(BaseModel):
    subject_id: str
    class_date: str
    section_id: Optional[str] = None
    name: Optional[str] = None

    @field_validator("section_id", "name", mode="before")
    @classmethod
    def empty_as_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v


class ClassStudentRecord(BaseModel):
    student_id: str
    confidence: Optional[float] = 1.0
    face_crop_base64: Optional[str] = None
    source: Optional[str] = None

    @field_validator("student_id", mode="before")
    @classmethod
    def student_id_str(cls, v):
        if v is None:
            raise ValueError("student_id is required")
        return str(v).strip()

    @field_validator("confidence", mode="before")
    @classmethod
    def clean_confidence(cls, v):
        if v is None or v == "":
            return 1.0
        try:
            f = float(v)
        except (TypeError, ValueError):
            return 1.0
        if f != f or f in (float("inf"), float("-inf")):
            return 1.0
        return f


class SaveClassRequest(BaseModel):
    records: List[ClassStudentRecord]


class ManualAddRequest(BaseModel):
    student_id: str


@router.post("")
def confirm_attendance(
    req: ConfirmAttendanceRequest,
    user: dict = Depends(require_teacher),
):
    supabase = get_supabase()
    for r in req.records:
        _check_subject_access(supabase, user, r.subject_id)
    results = []
    try:
        for r in req.records:
            rec = save_attendance(
                student_id=r.student_id,
                subject_id=r.subject_id,
                confidence=r.confidence,
                section_id=r.section_id,
                face_crop_base64=r.face_crop_base64,
                class_id=r.class_id,
                source=r.source or "face",
            )
            results.append(rec)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save attendance: {e}") from e
    return {"saved": len(results), "records": results}


@router.get("/classes")
def list_attendance_classes(
    subject_id: str,
    section_id: Optional[str] = None,
    class_date: Optional[str] = None,
    user: dict = Depends(require_teacher),
):
    _check_subject_access(get_supabase(), user, subject_id)
    try:
        return list_classes(subject_id, section_id=section_id, class_date=class_date)
    except Exception as e:
        if _is_schema_error(e):
            raise HTTPException(status_code=503, detail=SCHEMA_HINT) from e
        raise


@router.post("/classes")
def create_attendance_class(
    req: CreateClassRequest,
    user: dict = Depends(require_teacher),
):
    try:
        _check_subject_access(get_supabase(), user, req.subject_id)
        return create_class(
            subject_id=req.subject_id,
            class_date=req.class_date,
            section_id=req.section_id,
            name=req.name,
            created_by=user.get("user_id") or user.get("sub"),
        )
    except HTTPException:
        raise
    except Exception as e:
        if _is_schema_error(e):
            raise HTTPException(status_code=503, detail=SCHEMA_HINT) from e
        raise HTTPException(status_code=500, detail=f"Could not create class: {e}") from e


@router.get("/classes/{class_id}")
def get_attendance_class(
    class_id: str,
    user: dict = Depends(require_teacher),
):
    try:
        row = get_class(class_id)
    except Exception as e:
        if _is_schema_error(e):
            raise HTTPException(status_code=503, detail=SCHEMA_HINT) from e
        raise
    if not row:
        raise HTTPException(status_code=404, detail="Class not found")
    _check_subject_access(get_supabase(), user, row["subject_id"])
    return row


@router.post("/classes/{class_id}/save")
def save_attendance_class(
    class_id: str,
    req: SaveClassRequest,
    user: dict = Depends(require_teacher),
):
    def _load_and_save():
        row = get_class(class_id)
        if not row:
            raise HTTPException(status_code=404, detail="Class not found")
        _check_subject_access(get_supabase(), user, row["subject_id"])
        return save_class_roster(
            class_id,
            [r.model_dump(exclude_none=True) for r in req.records],
        )

    try:
        return _load_and_save()
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as first:
        reset_supabase()
        try:
            return _load_and_save()
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:
            if _is_schema_error(e) or _is_schema_error(first):
                raise HTTPException(status_code=503, detail=SCHEMA_HINT) from e
            raise HTTPException(status_code=500, detail=f"Could not save class: {e}") from e


@router.post("/classes/{class_id}/students")
def add_class_student_manual(
    class_id: str,
    req: ManualAddRequest,
    user: dict = Depends(require_teacher),
):
    row = get_class(class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Class not found")
    _check_subject_access(get_supabase(), user, row["subject_id"])
    try:
        return add_manual_student(class_id, req.student_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not add student: {e}") from e


@router.delete("/classes/{class_id}/students/{student_id}")
def delete_class_student(
    class_id: str,
    student_id: str,
    user: dict = Depends(require_teacher),
):
    row = get_class(class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Class not found")
    _check_subject_access(get_supabase(), user, row["subject_id"])
    remove_class_student(class_id, student_id)
    return {"message": "Removed"}


@router.delete("/classes/{class_id}")
def delete_attendance_class(
    class_id: str,
    user: dict = Depends(require_teacher),
):
    row = get_class(class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Class not found")
    _check_subject_access(get_supabase(), user, row["subject_id"])
    deleted = delete_class(class_id)
    return {"message": "Class deleted", "deleted": deleted}


@router.get("/list")
def list_attendance(
    subject_id: str,
    section_id: Optional[str] = None,
    class_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List attendance records for a subject (optionally filtered by section or class)."""
    role = user.get("role")
    if role not in ("TEACHER", "DEPARTMENT_ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    supabase = get_supabase()
    if role == "DEPARTMENT_ADMIN":
        subj = supabase.table("subjects").select("department_id").eq("id", subject_id).execute()
        if subj.data and str(user.get("department_id")) != str(subj.data[0].get("department_id")):
            raise HTTPException(status_code=403, detail="Cannot access this subject")
    elif role == "TEACHER":
        user_id = user.get("user_id") or user.get("sub")
        st = supabase.table("subject_teachers").select("subject_id").eq("teacher_id", user_id).execute()
        teacher_subject_ids = {r["subject_id"] for r in (st.data or [])}
        if subject_id not in teacher_subject_ids:
            raise HTTPException(status_code=403, detail="Cannot access this subject")
    
    q = supabase.table("attendance").select(
        "id, student_id, subject_id, section_id, class_id, timestamp, attendance_date, confidence, face_crop_url, source, "
        "students(reg_no, name), subjects(name), sections(name)"
    ).eq("subject_id", subject_id)
    
    if section_id:
        q = q.eq("section_id", section_id)
    if class_id:
        q = q.eq("class_id", class_id)
    
    try:
        result = q.order("timestamp", desc=False).execute()
    except Exception as e:
        if not _is_schema_error(e):
            raise
        q = supabase.table("attendance").select(
            "id, student_id, subject_id, section_id, timestamp, attendance_date, confidence, face_crop_url, "
            "students(reg_no, name), subjects(name), sections(name)"
        ).eq("subject_id", subject_id)
        if section_id:
            q = q.eq("section_id", section_id)
        result = q.order("timestamp", desc=False).execute()
    return result.data or []


@router.delete("/{attendance_id}")
def delete_attendance(
    attendance_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete attendance record and remove face crop from bucket."""
    role = user.get("role")
    if role not in ("TEACHER", "DEPARTMENT_ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    supabase = get_supabase()
    row = supabase.table("attendance").select("id, subject_id, face_crop_url").eq("id", attendance_id).execute()
    if row.data:
        subj_id = row.data[0].get("subject_id")
        if role == "DEPARTMENT_ADMIN":
            subj = supabase.table("subjects").select("department_id").eq("id", subj_id).execute()
            if subj.data and str(user.get("department_id")) != str(subj.data[0].get("department_id")):
                raise HTTPException(status_code=403, detail="Cannot delete this record")
        elif role == "TEACHER":
            user_id = user.get("user_id") or user.get("sub")
            st = supabase.table("subject_teachers").select("subject_id").eq("teacher_id", user_id).execute()
            teacher_subject_ids = {r["subject_id"] for r in (st.data or [])}
            if subj_id not in teacher_subject_ids:
                raise HTTPException(status_code=403, detail="Cannot delete this record")
    if not row.data:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    rec = row.data[0]
    path = _extract_storage_path(rec.get("face_crop_url"))
    if path:
        bucket = get_settings().bucket_attendance_crops
        try:
            supabase.storage.from_(bucket).remove([path])
        except Exception:
            pass
    supabase.table("attendance").delete().eq("id", attendance_id).execute()
    return {"message": "Deleted"}


@router.get("/subjects-with-reports")
def subjects_with_reports(
    department_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Return subjects that have at least one saved class or attendance record."""
    role = user.get("role")
    if role not in ("TEACHER", "DEPARTMENT_ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    supabase = get_supabase()
    dept_id = department_id or user.get("department_id")
    if role == "DEPARTMENT_ADMIN":
        dept_id = user.get("department_id")
        if not dept_id:
            raise HTTPException(status_code=400, detail="department_id required")
        if department_id and str(dept_id) != str(department_id):
            raise HTTPException(status_code=403, detail="Cannot access another department")
    elif role == "TEACHER" and not dept_id:
        raise HTTPException(status_code=400, detail="department_id required")

    subject_ids_with_att = set()
    att = supabase.table("attendance").select("subject_id").execute()
    subject_ids_with_att |= {r["subject_id"] for r in (att.data or []) if r.get("subject_id")}
    try:
        classes = supabase.table("attendance_classes").select("subject_id").execute()
        subject_ids_with_att |= {r["subject_id"] for r in (classes.data or []) if r.get("subject_id")}
    except Exception:
        pass
    if not subject_ids_with_att:
        return []

    q = supabase.table("subjects").select("id, name").in_("id", list(subject_ids_with_att))
    if dept_id:
        q = q.eq("department_id", dept_id)
    subs = q.execute().data or []
    if role == "TEACHER":
        allowed = _teacher_subject_ids(supabase, user)
        return [s for s in subs if s["id"] in allowed]
    return subs


@router.delete("/report/subject/{subject_id}")
def delete_subject_report(
    subject_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete entire attendance report for a subject: all records and all images from bucket."""
    role = user.get("role")
    if role not in ("TEACHER", "DEPARTMENT_ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    supabase = get_supabase()
    _check_subject_access(supabase, user, subject_id)
    rows = supabase.table("attendance").select("id, face_crop_url").eq("subject_id", subject_id).execute()
    bucket = get_settings().bucket_attendance_crops
    for r in (rows.data or []):
        path = _extract_storage_path(r.get("face_crop_url"))
        if path:
            try:
                supabase.storage.from_(bucket).remove([path])
            except Exception:
                pass
    supabase.table("attendance").delete().eq("subject_id", subject_id).execute()
    try:
        supabase.table("attendance_classes").delete().eq("subject_id", subject_id).execute()
    except Exception:
        pass
    return {"message": "Report deleted", "deleted": len(rows.data or [])}


@router.get("/report")
def attendance_report(
    subject_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Generate Excel attendance report."""
    supabase = get_supabase()
    role = user.get("role")
    if role not in ("TEACHER", "DEPARTMENT_ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    _check_subject_access(supabase, user, subject_id)

    # Fetch attendance with student and subject info
    q = supabase.table("attendance").select(
        "id, student_id, subject_id, timestamp, attendance_date, confidence, students(reg_no, name), subjects(name)"
    ).eq("subject_id", subject_id)

    if start_date:
        q = q.gte("timestamp", start_date)
    if end_date:
        q = q.lte("timestamp", end_date)

    result = q.order("timestamp", desc=False).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No attendance data found")

    # Flatten for DataFrame
    rows = []
    for r in result.data:
        student = r.get("students") or {}
        subject = r.get("subjects") or {}
        ts = r.get("timestamp") or r.get("attendance_date")
        ts_str = str(ts) if ts else ""
        rows.append({
            "Date": ts_str[:10] if ts_str else "",
            "Time": ts_str[11:19] if len(ts_str) > 11 else "",
            "Reg No": student.get("reg_no", ""),
            "Student Name": student.get("name", ""),
            "Subject": subject.get("name", ""),
            "Confidence": r.get("confidence", 0),
        })

    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Attendance")
    output.seek(0)

    filename = f"attendance_report_{subject_id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def _fetch_attendance_for_report(
    supabase,
    subject_id: str,
    start_date: Optional[str],
    end_date: Optional[str],
    class_id: Optional[str] = None,
):
    q = supabase.table("attendance").select(
        "id, student_id, subject_id, timestamp, attendance_date, confidence, face_crop_url, source, "
        "students(reg_no, name), subjects(name)"
    ).eq("subject_id", subject_id)
    if class_id:
        q = q.eq("class_id", class_id)
    if start_date:
        q = q.gte("timestamp", start_date)
    if end_date:
        q = q.lte("timestamp", end_date)
    result = q.order("timestamp", desc=False).execute()
    return result.data or []


@router.get("/report/simple-excel")
def attendance_report_simple_excel(
    subject_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    class_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Simplified Excel: Subject heading, Time, Student Name, Reg No only."""
    role = user.get("role")
    if role not in ("TEACHER", "DEPARTMENT_ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    supabase = get_supabase()
    _check_subject_access(supabase, user, subject_id)
    data = _fetch_attendance_for_report(supabase, subject_id, start_date, end_date, class_id)
    if not data:
        raise HTTPException(status_code=404, detail="No attendance data found")
    subject_name = (data[0].get("subjects") or {}).get("name", "")
    rows = []
    for r in data:
        student = r.get("students") or {}
        ts = r.get("timestamp") or r.get("attendance_date")
        ts_str = str(ts) if ts else ""
        rows.append({
            "Subject": subject_name,
            "Time": ts_str[:19] if ts_str else "",
            "Student Name": student.get("name", ""),
            "Reg No": student.get("reg_no", ""),
        })
    df = pd.DataFrame(rows)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Attendance")
    output.seek(0)
    filename = f"attendance_{subject_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/report/simple-pdf")
def attendance_report_simple_pdf(
    subject_id: str,
    attendance_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    class_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """Simplified PDF: Subject heading, Time, Student Name, Reg No. Use attendance_id for single record."""
    role = user.get("role")
    if role not in ("TEACHER", "DEPARTMENT_ADMIN"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    supabase = get_supabase()
    _check_subject_access(supabase, user, subject_id)
    if attendance_id:
        row = supabase.table("attendance").select(
            "id, student_id, subject_id, timestamp, attendance_date, students(reg_no, name), subjects(name)"
        ).eq("id", attendance_id).execute()
        data = row.data or []
    else:
        data = _fetch_attendance_for_report(supabase, subject_id, start_date, end_date, class_id)
    if not data:
        raise HTTPException(status_code=404, detail="No attendance data found")
    from fpdf import FPDF
    from fpdf.fonts import FontFace
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", "B", 14)
    subject_name = (data[0].get("subjects") or {}).get("name", "Attendance")
    pdf.cell(0, 10, f"Subject: {subject_name}", ln=True)
    if class_id:
        cls = get_class(class_id)
        if cls:
            pdf.set_font("helvetica", "", 11)
            pdf.cell(0, 8, f"{cls.get('name') or 'Class'}  {cls.get('class_date') or ''}", ln=True)
            pdf.set_font("helvetica", "B", 14)
    pdf.set_font("helvetica", "", 10)
    pdf.ln(4)
    headings_style = FontFace(emphasis="BOLD", fill_color=(240, 240, 240))
    with pdf.table(
        col_widths=(1, 1, 3, 1),
        headings_style=headings_style,
        text_align=("CENTER", "LEFT", "LEFT", "LEFT"),
    ) as table:
        row = table.row()
        row.cell("#")
        row.cell("Reg No")
        row.cell("Name")
        row.cell("Time")
        for i, r in enumerate(data, 1):
            student = r.get("students") or {}
            ts = r.get("timestamp") or r.get("attendance_date")
            ts_str = str(ts)[:19] if ts else ""
            row = table.row()
            row.cell(str(i))
            row.cell(student.get("reg_no", ""))
            row.cell(student.get("name", ""))
            row.cell(ts_str)
    output = io.BytesIO()
    pdf.output(output)
    output.seek(0)
    filename = f"attendance_{subject_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
