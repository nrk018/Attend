from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth.deps import get_current_user, require_dept_admin, require_roles, require_super_admin
from app.config import get_settings
from app.db.supabase import get_supabase, reset_supabase
from app.face.faiss_index import invalidate_college_index
from app.services.enrollment import add_face_embeddings, enroll_existing_student
from app.services.embedding_backfill import generate_embeddings_for_college
from app.services.student_registration import (
    approve_pending_enrollment,
    deny_pending_enrollment,
    list_pending_enrollments,
    review_photo_bytes,
)
from app.services.storage_urls import attach_signed_photo_urls

router = APIRouter()


class ProvisionStudentRequest(BaseModel):
    reg_no: str
    name: str
    email: str
    phone: str
    department_id: str
    college_id: Optional[str] = None


class UpdateStudentRequest(BaseModel):
    reg_no: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    department_id: Optional[str] = None


def _student_row(row: dict) -> dict:
    return {
        **row,
        "id": str(row["id"]),
        "college_id": str(row["college_id"]) if row.get("college_id") else None,
        "department_id": str(row["department_id"]) if row.get("department_id") else None,
    }


@router.post("")
def provision_student(
    req: ProvisionStudentRequest,
    user: dict = Depends(require_super_admin),
):
    supabase = get_supabase()
    college_id = req.college_id or user.get("college_id")
    if not college_id or str(user.get("college_id")) != str(college_id):
        raise HTTPException(status_code=403, detail="Cannot add students for another college")
    dept = supabase.table("departments").select("id, college_id").eq("id", req.department_id).execute()
    if not dept.data or str(dept.data[0]["college_id"]) != str(college_id):
        raise HTTPException(status_code=400, detail="Department must belong to your college")

    email = str(req.email).strip().lower()
    data = {
        "reg_no": req.reg_no.strip(),
        "name": req.name.strip(),
        "email": email,
        "phone": req.phone.strip(),
        "college_id": college_id,
        "department_id": req.department_id,
        "email_verified": False,
        "enrollment_status": "provisioned",
    }
    try:
        result = supabase.table("students").insert(data).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Registration number or email already exists in this college")
        raise HTTPException(status_code=500, detail="Failed to add student") from exc
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to add student")
    return _student_row(result.data[0])


@router.post("/enroll")
async def enroll_student_endpoint(
    student_id: str = Form(...),
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    id_card: Optional[UploadFile] = File(None),
    user: dict = Depends(require_dept_admin),
):
    supabase = get_supabase()
    row = supabase.table("students").select("id, college_id, department_id, enrollment_status, name").eq("id", student_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = row.data[0]
    if str(user.get("college_id")) != str(student["college_id"]) or str(user.get("department_id")) != str(student["department_id"]):
        raise HTTPException(status_code=403, detail="Cannot enroll a student outside your department")
    if student.get("enrollment_status") == "enrolled":
        raise HTTPException(status_code=400, detail="Student is already enrolled")

    try:
        return enroll_existing_student(
            student_id=student_id,
            front_image_bytes=await front.read(),
            left_image_bytes=await left.read(),
            right_image_bytes=await right.read(),
            id_card_bytes=await id_card.read() if id_card else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class GenerateEmbeddingsRequest(BaseModel):
    college_id: str


@router.post("/generate-embeddings")
def generate_embeddings_endpoint(
    req: GenerateEmbeddingsRequest,
    user: dict = Depends(require_roles("SUPER_ADMIN", "DEPARTMENT_ADMIN")),
):
    if str(user.get("college_id") or "") != req.college_id:
        raise HTTPException(status_code=403, detail="Cannot generate embeddings for another college")
    return generate_embeddings_for_college(req.college_id)


@router.get("/pending-approval")
def pending_student_approvals(user: dict = Depends(require_super_admin)):
    college_id = user.get("college_id")
    if not college_id:
        raise HTTPException(status_code=400, detail="college_id required")
    rows = list_pending_enrollments(str(college_id))
    return rows


@router.post("/{student_id}/approve-enrollment")
def approve_student_enrollment(
    student_id: str,
    user: dict = Depends(require_super_admin),
):
    try:
        return approve_pending_enrollment(student_id, str(user.get("college_id") or ""))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{student_id}/deny-enrollment")
def deny_student_enrollment(
    student_id: str,
    user: dict = Depends(require_super_admin),
):
    try:
        return deny_pending_enrollment(student_id, str(user.get("college_id") or ""))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc) or "Could not deny this student. Try again.") from exc


@router.get("/{student_id}/review-photo/{kind}")
def student_review_photo(
    student_id: str,
    kind: str,
    user: dict = Depends(require_super_admin),
):
    try:
        raw = review_photo_bytes(student_id, str(user.get("college_id") or ""), kind)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return Response(content=raw, media_type="image/jpeg")


@router.get("")
def list_students(
    college_id: Optional[str] = None,
    department_id: Optional[str] = None,
    include_photos: bool = Query(True),
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    role = user.get("role")
    if role == "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    college_filter = user.get("college_id") if role in ("SUPER_ADMIN", "DEPARTMENT_ADMIN", "TEACHER") else college_id
    dept_filter = user.get("department_id") if role in ("DEPARTMENT_ADMIN", "TEACHER") else department_id
    if not college_filter:
        raise HTTPException(status_code=400, detail="college_id required")

    columns = (
        "id, name, reg_no, email, phone, college_id, department_id, enrollment_status, email_verified"
        if not include_photos
        else "*, departments(name)"
    )
    q = supabase.table("students").select(columns)
    if college_filter:
        q = q.eq("college_id", college_filter)
    if dept_filter:
        q = q.eq("department_id", dept_filter)
    result = q.order("created_at", desc=True).execute()
    data = result.data or []
    if include_photos:
        for row in data:
            dept = row.pop("departments", None)
            row["department_name"] = dept.get("name") if isinstance(dept, dict) else None
        attach_signed_photo_urls(data)
    return data


def _can_view_student(actor: dict, student_college_id: str, student_dept_id: str) -> bool:
    role = actor.get("role")
    if role == "SUPER_ADMIN":
        return str(actor.get("college_id")) == str(student_college_id)
    if role in ("DEPARTMENT_ADMIN", "TEACHER"):
        return str(actor.get("college_id")) == str(student_college_id) and str(actor.get("department_id")) == str(student_dept_id)
    return False


@router.get("/{student_id}")
def get_student(
    student_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    row = supabase.table("students").select("*, departments(name)").eq("id", student_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = row.data[0]
    if not _can_view_student(user, student["college_id"], student["department_id"]):
        raise HTTPException(status_code=403, detail="Cannot view this student")
    dept = student.pop("departments", None)
    student["department_name"] = dept.get("name") if isinstance(dept, dict) else None
    attach_signed_photo_urls(
        [student],
        url_keys=("primary_image_url", "left_image_url", "right_image_url", "id_card_url"),
    )
    return student


@router.patch("/{student_id}")
def update_student(
    student_id: str,
    req: UpdateStudentRequest,
    user: dict = Depends(require_super_admin),
):
    supabase = get_supabase()
    row = supabase.table("students").select("*").eq("id", student_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = row.data[0]
    if str(user.get("college_id")) != str(student["college_id"]):
        raise HTTPException(status_code=403, detail="Cannot update this student")

    updates = {}
    if req.reg_no is not None:
        updates["reg_no"] = req.reg_no.strip()
    if req.name is not None:
        updates["name"] = req.name.strip()
    if req.email is not None:
        updates["email"] = str(req.email).strip().lower()
        updates["email_verified"] = False
        if student.get("enrollment_status") != "enrolled":
            updates["enrollment_status"] = "provisioned"
    if req.phone is not None:
        updates["phone"] = req.phone.strip()
    if req.department_id is not None:
        new_dept = supabase.table("departments").select("college_id").eq("id", req.department_id).execute()
        if not new_dept.data:
            raise HTTPException(status_code=400, detail="Department not found")
        if str(new_dept.data[0]["college_id"]) != str(student["college_id"]):
            raise HTTPException(status_code=400, detail="Department must be in same college")
        updates["department_id"] = req.department_id

    if not updates:
        return {"id": student_id, **student}

    supabase.table("students").update(updates).eq("id", student_id).execute()
    invalidate_college_index(str(student["college_id"]))
    return {"id": student_id, **student, **updates}


@router.post("/{student_id}/add-face")
async def add_face_endpoint(
    student_id: str,
    left: Optional[UploadFile] = File(None),
    right: Optional[UploadFile] = File(None),
    user: dict = Depends(require_dept_admin),
):
    if not left and not right:
        raise HTTPException(status_code=400, detail="At least one of left or right image is required")
    supabase = get_supabase()
    row = supabase.table("students").select("college_id, department_id").eq("id", student_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Student not found")
    student = row.data[0]
    if str(user.get("college_id")) != str(student["college_id"]) or str(user.get("department_id")) != str(student["department_id"]):
        raise HTTPException(status_code=403, detail="Cannot update this student")

    try:
        return add_face_embeddings(
            student_id,
            await left.read() if left else None,
            await right.read() if right else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _delete_student_storage(supabase, college_id: str, student_id: str) -> None:
    bucket = get_settings().bucket_primary_faces
    prefix = f"{college_id}/{student_id}"
    paths = [f"{prefix}/primary.jpg", f"{prefix}/left.jpg", f"{prefix}/right.jpg", f"{prefix}/id.jpg"]
    try:
        supabase.storage.from_(bucket).remove(paths)
    except Exception:
        pass


@router.delete("/{student_id}")
def delete_student(
    student_id: str,
    user: dict = Depends(require_super_admin),
):

    def _do_delete():
        supabase = get_supabase()
        row = supabase.table("students").select("id, college_id, department_id").eq("id", student_id).execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Student not found")
        student = row.data[0]
        same_college = str(user.get("college_id")) == str(student["college_id"])
        if not same_college:
            raise HTTPException(status_code=403, detail="Cannot delete this student")
        _delete_student_storage(supabase, str(student["college_id"]), student_id)
        try:
            supabase.table("students").delete().eq("id", student_id).execute()
        except Exception as exc:
            reset_supabase()
            supabase = get_supabase()
            supabase.table("students").delete().eq("id", student_id).execute()
        invalidate_college_index(str(student["college_id"]))
        return {"message": "Student deleted"}

    try:
        return _do_delete()
    except HTTPException:
        raise
    except Exception as first:
        reset_supabase()
        try:
            return _do_delete()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not delete student: {exc}") from exc
