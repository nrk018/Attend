"""Turn stored face URLs into short-lived signed URLs.

Enrollment saves public-style storage URLs, but primary-faces is private,
so those URLs 404 in the browser. Sign at read time instead.
"""
from typing import Iterable, Optional
from urllib.parse import unquote

from app.config import get_settings
from app.db.supabase import get_supabase


def _bucket() -> str:
    return get_settings().bucket_primary_faces


def storage_path_from_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    raw = str(url).split("?", 1)[0].rstrip("/")
    bucket = _bucket()
    markers = [
        f"/object/public/{bucket}/",
        f"/object/sign/{bucket}/",
        f"/object/authenticated/{bucket}/",
        f"/object/{bucket}/",
    ]
    for marker in markers:
        if marker in raw:
            return unquote(raw.split(marker, 1)[1])
    return None


def face_path(college_id: Optional[str], student_id: Optional[str]) -> Optional[str]:
    if college_id and student_id:
        return f"{college_id}/{student_id}/primary.jpg"
    return None


def student_photo_path(college_id: Optional[str], student_id: Optional[str], filename: str) -> Optional[str]:
    if college_id and student_id and filename:
        return f"{college_id}/{student_id}/{filename}"
    return None


def _normalize_signed(signed: str) -> str:
    if signed.startswith("http://") or signed.startswith("https://"):
        return signed
    base = get_settings().supabase_url.rstrip("/")
    if not signed.startswith("/"):
        signed = "/" + signed
    return base + signed


def signed_urls_for_paths(paths: Iterable[str], expires_in: int = 3600) -> dict[str, str]:
    unique = [p for p in dict.fromkeys(paths) if p]
    if not unique:
        return {}
    supabase = get_supabase()
    bucket = supabase.storage.from_(_bucket())
    items: list = []
    try:
        items = bucket.create_signed_urls(unique, expires_in) or []
    except Exception:
        for path in unique:
            try:
                one = bucket.create_signed_url(path, expires_in) or {}
                if isinstance(one, dict):
                    one.setdefault("path", path)
                    items.append(one)
            except Exception:
                continue

    out: dict[str, str] = {}
    for idx, item in enumerate(items):
        if not isinstance(item, dict) or item.get("error"):
            continue
        path = item.get("path") or (unique[idx] if idx < len(unique) else None)
        signed = item.get("signedURL") or item.get("signedUrl") or item.get("signed_url")
        if not path or not signed:
            continue
        out[str(path)] = _normalize_signed(str(signed))
    if len(out) < len(unique):
        for path in unique:
            if path in out:
                continue
            try:
                one = bucket.create_signed_url(path, expires_in) or {}
                signed = one.get("signedURL") or one.get("signedUrl") or one.get("signed_url")
                if signed:
                    out[path] = _normalize_signed(str(signed))
            except Exception:
                continue
    return out


def attach_signed_photo_urls(
    rows: list[dict],
    url_keys: tuple[str, ...] = ("primary_image_url",),
) -> list[dict]:
    assignments: list[tuple[int, str, Optional[str]]] = []
    paths: list[str] = []
    fallbacks = {
        "primary_image_url": "primary.jpg",
        "left_image_url": "left.jpg",
        "right_image_url": "right.jpg",
        "id_card_url": "id.jpg",
    }
    for i, row in enumerate(rows):
        for key in url_keys:
            path = storage_path_from_url(row.get(key))
            if not path:
                path = student_photo_path(row.get("college_id"), row.get("id"), fallbacks.get(key, ""))
            assignments.append((i, key, path))
            if path:
                paths.append(path)
    signed = signed_urls_for_paths(paths)
    for i, key, path in assignments:
        rows[i][key] = signed.get(path) if path else None
    return rows
