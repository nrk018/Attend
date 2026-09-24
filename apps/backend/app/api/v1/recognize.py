from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth.deps import require_teacher
from app.db.supabase import get_supabase
from app.services.attendance import recognize_faces, create_stream_session, clear_stream_session


def _assert_teacher_subject(user: dict, subject_id: str) -> None:
    supabase = get_supabase()
    user_id = user.get("user_id") or user.get("sub")
    st = supabase.table("subject_teachers").select("subject_id").eq("teacher_id", user_id).eq("subject_id", subject_id).execute()
    if st.data:
        return
    assigned = supabase.table("section_teachers").select("section_id").eq("teacher_id", user_id).execute()
    section_ids = [r["section_id"] for r in (assigned.data or []) if r.get("section_id")]
    if section_ids:
        secs = supabase.table("sections").select("subject_id").in_("id", section_ids).eq("subject_id", subject_id).execute()
        if secs.data:
            return
    raise HTTPException(status_code=403, detail="Cannot access this subject")

router = APIRouter()


@router.post("")
async def recognize(
    subject_id: str = Form(...),
    image: UploadFile = File(...),
    section_id: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    user: dict = Depends(require_teacher),
):
    college_id = user.get("college_id")
    if not college_id:
        raise HTTPException(status_code=400, detail="User must have college_id")
    _assert_teacher_subject(user, subject_id)

    try:
        image_bytes = await image.read()
        results, img_h, img_w = recognize_faces(
            image_bytes=image_bytes,
            college_id=college_id,
            subject_id=subject_id,
            section_id=section_id,
            session_id=session_id,
        )
        return {"results": results, "image_width": img_w, "image_height": img_h}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")


@router.post("/stream/start")
def stream_start(user: dict = Depends(require_teacher)):
    """Start a new live stream session."""
    session_id = create_stream_session()
    return {"session_id": session_id}


@router.post("/stream")
async def recognize_stream(
    session_id: str = Form(...),
    subject_id: str = Form(...),
    image: UploadFile = File(...),
    section_id: Optional[str] = Form(None),
    user: dict = Depends(require_teacher),
):
    college_id = user.get("college_id")
    if not college_id:
        raise HTTPException(status_code=400, detail="User must have college_id")
    _assert_teacher_subject(user, subject_id)

    image_bytes = await image.read()
    results, img_h, img_w = recognize_faces(
        image_bytes=image_bytes,
        college_id=college_id,
        subject_id=subject_id,
        section_id=section_id,
        session_id=session_id,
    )
    return {"results": results, "image_width": img_w, "image_height": img_h}


@router.post("/stream/end")
def stream_end(
    session_id: str = Form(...),
    user: dict = Depends(require_teacher),
):
    clear_stream_session(session_id)
    return {"status": "ok"}


