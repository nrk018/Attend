from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.auth.deps import get_current_user
from app.auth.jwt import hash_password
from app.auth.rbac import (
    DEPARTMENT_ADMIN,
    PLATFORM_ADMIN,
    SUPER_ADMIN,
    TEACHER,
    can_approve_user,
    can_create_role,
    can_delete_user,
)
from app.db.supabase import get_supabase
from app.services.email import (
    generate_verification_token,
    send_verification_email,
    send_super_admin_welcome_email,
    verification_expires_at,
)
from pydantic import BaseModel

router = APIRouter()


class CreateUserRequest(BaseModel):
    email: str
    password: str
    role: str
    name: Optional[str] = None
    contact_number: Optional[str] = None
    college_id: Optional[str] = None
    department_id: Optional[str] = None


@router.post("")
def create_user(
    req: CreateUserRequest,
    user: dict = Depends(get_current_user),
):
    creator_role = user.get("role")
    if not can_create_role(creator_role, req.role):
        raise HTTPException(status_code=403, detail="Cannot create this role")

    if creator_role == PLATFORM_ADMIN:
        if req.role != SUPER_ADMIN or not req.college_id:
            raise HTTPException(status_code=400, detail="Platform Admin must create SUPER_ADMIN with college_id")
    elif creator_role == SUPER_ADMIN:
        if req.role != DEPARTMENT_ADMIN or not req.college_id or not req.department_id:
            raise HTTPException(
                status_code=400,
                detail="Super Admin must create DEPARTMENT_ADMIN with college_id and department_id",
            )
        if str(user.get("college_id")) != req.college_id:
            raise HTTPException(status_code=403, detail="Cannot create user for another college")
    elif creator_role == DEPARTMENT_ADMIN:
        if req.role != TEACHER or not req.college_id or not req.department_id:
            raise HTTPException(status_code=400, detail="Dept Admin must create TEACHER with college_id and department_id")
        if str(user.get("college_id")) != req.college_id or str(user.get("department_id")) != req.department_id:
            raise HTTPException(status_code=403, detail="Cannot create user outside your department")
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    supabase = get_supabase()
    token = generate_verification_token()
    data = {
        "email": req.email.strip().lower(),
        "password_hash": hash_password(req.password),
        "role": req.role,
        "name": req.name,
        "contact_number": req.contact_number,
        "college_id": req.college_id,
        "department_id": req.department_id,
        "email_verified": False,
        "email_verification_token": token,
        "email_verification_expires_at": verification_expires_at().isoformat(),
    }
    result = supabase.table("users").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user")

    if creator_role == PLATFORM_ADMIN and req.role == SUPER_ADMIN and req.college_id:
        college_row = supabase.table("colleges").select("name").eq("id", req.college_id).execute()
        college_name = college_row.data[0]["name"] if college_row.data else "your college"
        send_super_admin_welcome_email(req.email, token, college_name)
    else:
        send_verification_email(req.email, token)
    return {
        "id": str(result.data[0]["id"]),
        "email": req.email,
        "role": req.role,
        "name": req.name,
        "contact_number": req.contact_number,
    }


@router.get("")
def list_users(
    college_id: Optional[str] = None,
    department_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    role = user.get("role")
    if role == TEACHER:
        raise HTTPException(status_code=403, detail="Teachers cannot list users")
    college_id_filter = user.get("college_id") if role in (SUPER_ADMIN, DEPARTMENT_ADMIN) else college_id
    dept_filter = user.get("department_id") if role == DEPARTMENT_ADMIN else department_id

    q = supabase.table("users").select(
        "id, email, role, name, contact_number, college_id, department_id, created_at, email_verified"
    )
    if college_id_filter:
        q = q.eq("college_id", college_id_filter)
    if dept_filter:
        q = q.eq("department_id", dept_filter)
    result = q.execute()
    rows = result.data or []
    names = _department_names(supabase, [r.get("department_id") for r in rows])
    return [
        {
            **r,
            "department_name": names.get(str(r["department_id"])) if r.get("department_id") else None,
        }
        for r in rows
    ]


def _department_names(supabase, department_ids: list) -> dict:
    ids = [d for d in dict.fromkeys(department_ids) if d]
    if not ids:
        return {}
    dept_rows = supabase.table("departments").select("id, name").in_("id", ids).execute()
    return {str(r["id"]): r.get("name") for r in (dept_rows.data or [])}


def _college_names(supabase, college_ids: list) -> dict:
    ids = [c for c in dict.fromkeys(college_ids) if c]
    if not ids:
        return {}
    rows = supabase.table("colleges").select("id, name").in_("id", ids).execute()
    return {str(r["id"]): r.get("name") for r in (rows.data or [])}


@router.get("/pending")
def list_pending_users(user: dict = Depends(get_current_user)):
    role = user.get("role")
    if role not in (PLATFORM_ADMIN, SUPER_ADMIN):
        raise HTTPException(status_code=403, detail="Only Platform Admin or Super Admin can view pending approvals")
    supabase = get_supabase()
    q = supabase.table("users").select(
        "id, email, role, name, contact_number, college_id, department_id, created_at, email_verified"
    ).eq("email_verified", False)
    if role == SUPER_ADMIN:
        q = q.eq("college_id", user.get("college_id"))
    result = q.order("created_at", desc=True).execute()
    rows = result.data or []
    names = _college_names(supabase, [r.get("college_id") for r in rows])
    pending = []
    for r in rows:
        if r.get("role") == PLATFORM_ADMIN:
            continue
        if not can_approve_user(role, r["role"], user.get("college_id"), r.get("college_id")):
            continue
        pending.append({
            **r,
            "id": str(r["id"]),
            "college_id": str(r["college_id"]) if r.get("college_id") else None,
            "department_id": str(r["department_id"]) if r.get("department_id") else None,
            "college_name": names.get(str(r["college_id"])) if r.get("college_id") else None,
        })
    return pending


@router.post("/{user_id}/approve")
def approve_user(
    user_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    result = supabase.table("users").select(
        "id, email, role, college_id, email_verified"
    ).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    target = result.data[0]
    if target.get("email_verified"):
        return {"message": "User is already approved", "id": str(target["id"]), "email": target["email"]}
    if not can_approve_user(
        user.get("role"),
        target["role"],
        user.get("college_id"),
        target.get("college_id"),
    ):
        raise HTTPException(status_code=403, detail="Cannot approve this user")
    supabase.table("users").update({
        "email_verified": True,
        "email_verification_token": None,
        "email_verification_expires_at": None,
    }).eq("id", user_id).execute()
    return {"message": "User approved", "id": str(target["id"]), "email": target["email"]}


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    user: dict = Depends(get_current_user),
):
    supabase = get_supabase()
    result = supabase.table("users").select("id, email, role, college_id, department_id").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    target = result.data[0]
    if not can_delete_user(
        user.get("role"),
        target["role"],
        user.get("college_id"),
        user.get("department_id"),
        target.get("college_id"),
        target.get("department_id"),
    ):
        raise HTTPException(status_code=403, detail="Cannot delete this user")
    supabase.table("users").delete().eq("id", user_id).execute()
    return {"message": "User deleted"}
