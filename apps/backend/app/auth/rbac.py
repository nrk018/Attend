from typing import Optional

from fastapi import HTTPException

PLATFORM_ADMIN = "PLATFORM_ADMIN"
SUPER_ADMIN = "SUPER_ADMIN"
DEPARTMENT_ADMIN = "DEPARTMENT_ADMIN"
TEACHER = "TEACHER"


def role_of(user: dict) -> str:
    return str(user.get("role") or "")


def _same(left, right) -> bool:
    return left is not None and right is not None and str(left) == str(right)


def assert_roles(user: dict, *allowed: str) -> None:
    if role_of(user) not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


def assert_college_scope(user: dict, college_id: Optional[str]) -> None:
    role = role_of(user)
    if role == PLATFORM_ADMIN:
        return
    if not college_id or not _same(user.get("college_id"), college_id):
        raise HTTPException(status_code=403, detail="Outside your college")


def assert_department_scope(user: dict, college_id: Optional[str], department_id: Optional[str]) -> None:
    role = role_of(user)
    if role == SUPER_ADMIN:
        assert_college_scope(user, college_id)
        return
    if role == DEPARTMENT_ADMIN:
        if not _same(user.get("college_id"), college_id) or not _same(user.get("department_id"), department_id):
            raise HTTPException(status_code=403, detail="Outside your department")
        return
    raise HTTPException(status_code=403, detail="Insufficient permissions")


def can_create_role(creator_role: str, target_role: str) -> bool:
    allowed = {
        PLATFORM_ADMIN: [SUPER_ADMIN],
        SUPER_ADMIN: [DEPARTMENT_ADMIN],
        DEPARTMENT_ADMIN: [TEACHER],
    }
    return target_role in allowed.get(creator_role, [])


def can_approve_user(actor_role: str, target_role: str, actor_college_id, target_college_id) -> bool:
    if actor_role == PLATFORM_ADMIN:
        return target_role == SUPER_ADMIN
    if actor_role == SUPER_ADMIN:
        return target_role == DEPARTMENT_ADMIN and _same(actor_college_id, target_college_id)
    return False


def can_delete_user(
    actor_role: str,
    target_role: str,
    actor_college_id,
    actor_dept_id,
    target_college_id,
    target_dept_id,
) -> bool:
    if actor_role == PLATFORM_ADMIN:
        return target_role == SUPER_ADMIN
    if actor_role == SUPER_ADMIN:
        return target_role == DEPARTMENT_ADMIN and _same(actor_college_id, target_college_id)
    if actor_role == DEPARTMENT_ADMIN:
        return (
            target_role == TEACHER
            and _same(actor_college_id, target_college_id)
            and _same(actor_dept_id, target_dept_id)
        )
    return False
