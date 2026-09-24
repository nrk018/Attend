import time
from typing import Optional

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.db.supabase import get_supabase, reset_supabase
from app.services.student_registration import (
    compare_live_to_id,
    lookup_and_send_verify,
    preview_id_jpeg,
    save_id_card,
    student_id_from_session,
    submit_live_faces,
    verify_email_token,
)

router = APIRouter()
_hits: dict[str, list[float]] = {}
_colleges_cache: dict = {"at": 0.0, "rows": None}


def _rate_limit(request: Request, limit: int = 8, window: float = 60.0) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    stamps = [t for t in _hits.get(ip, []) if now - t < window]
    if len(stamps) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again shortly.")
    stamps.append(now)
    _hits[ip] = stamps


class LookupRequest(BaseModel):
    college_id: str
    reg_no: str


def _session_student(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Registration session required")
    try:
        return student_id_from_session(authorization.split(" ", 1)[1].strip())
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/colleges")
def public_colleges():
    if _colleges_cache["rows"] is not None and (time.time() - float(_colleges_cache["at"])) < 60:
        return _colleges_cache["rows"]

    def _load():
        supabase = get_supabase()
        result = supabase.table("colleges").select("id, name").order("name").execute()
        return [{"id": str(r["id"]), "name": r["name"]} for r in (result.data or [])]

    reset_supabase()
    try:
        rows = _load()
    except Exception:
        reset_supabase()
        try:
            rows = _load()
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Could not load colleges. Try again.") from exc
    _colleges_cache["rows"] = rows
    _colleges_cache["at"] = time.time()
    return rows


@router.get("/colleges/{college_id}/departments")
def public_departments(college_id: str):
    supabase = get_supabase()
    result = supabase.table("departments").select("id, name").eq("college_id", college_id).order("name").execute()
    return [{"id": str(r["id"]), "name": r["name"]} for r in (result.data or [])]


@router.post("/students/lookup")
def lookup_student(req: LookupRequest, request: Request):
    _rate_limit(request)
    if not req.college_id or not req.reg_no.strip():
        raise HTTPException(status_code=400, detail="College and registration number are required")
    try:
        return lookup_and_send_verify(req.college_id, req.reg_no)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/students/verify-email")
def verify_student_email(token: str):
    try:
        return verify_email_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/students/id-preview")
async def preview_id_card(
    id_card: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    _session_student(authorization)
    raw = await id_card.read()
    try:
        jpeg = preview_id_jpeg(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(content=jpeg, media_type="image/jpeg")


@router.post("/students/id-card")
async def upload_id_card(
    id_card: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    student_id = _session_student(authorization)
    raw = await id_card.read()
    try:
        return save_id_card(student_id, raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc) or "Could not save the ID card. Try again.") from exc


@router.post("/students/compare-face")
async def compare_face(
    live: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    student_id = _session_student(authorization)
    try:
        return compare_live_to_id(student_id, await live.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/students/faces")
async def upload_faces(
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    student_id = _session_student(authorization)
    raw_front, raw_left, raw_right = await front.read(), await left.read(), await right.read()
    try:
        return submit_live_faces(student_id, raw_front, raw_left, raw_right)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not save live photos. Try again.") from exc
