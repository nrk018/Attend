import re

import cv2
import numpy as np

_ocr = None
_REG_RE = re.compile(r"[A-Z0-9]{8,20}")
_NAME_LABELS = ("STUDENT NAME", "NAME")
_REG_LABELS = ("REGISTRATION NUMBER", "REGISTRATION NO", "REG. NO", "REG NO")


def _engine():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr = RapidOCR()
    return _ocr


def _norm_reg(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def _fold_reg(value: str) -> str:
    return _norm_reg(value).replace("O", "0").replace("I", "1").replace("L", "1")


def _norm_name(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z ]", " ", (value or "").upper())).strip()


def _compact_name(value: str) -> str:
    return re.sub(r"[^A-Z]", "", (value or "").upper())


def _name_tokens(value: str) -> list:
    return [t for t in _norm_name(value).split(" ") if len(t) > 1 or t in {"R", "M", "S", "K"}]


def _read_lines(image: np.ndarray) -> list:
    h, w = image.shape[:2]
    max_w = 1600
    work = image
    if w > max_w:
        scale = max_w / w
        work = cv2.resize(image, (max_w, int(h * scale)))
    result, _ = _engine()(work)
    lines = []
    if not result:
        return lines
    for item in result:
        text = ""
        if isinstance(item, (list, tuple)) and len(item) > 1:
            text = str(item[1] or "").strip()
        elif isinstance(item, dict):
            text = str(item.get("text") or item.get("txt") or "").strip()
        if text:
            lines.append(text)
    return lines


def _after_label(lines: list, labels: tuple) -> str:
    for i, line in enumerate(lines):
        compact = _norm_name(line)
        for label in labels:
            if compact == label or compact.startswith(label + " "):
                rest = compact[len(label):].strip()
                if rest:
                    return rest
                if i + 1 < len(lines):
                    return lines[i + 1].strip()
    return ""


def _extract_reg(lines: list, expected: str) -> str:
    want = _norm_reg(expected)
    want_fold = _fold_reg(expected)
    labeled = _after_label(lines, _REG_LABELS)
    candidates = [labeled] if labeled else []
    candidates.extend(lines)
    blob = _norm_reg(" ".join(lines))
    if want and want in blob:
        return expected.strip()
    if want_fold and want_fold in _fold_reg(" ".join(lines)):
        return expected.strip()
    for line in candidates:
        compact = _norm_reg(line)
        folded = _fold_reg(line)
        if want and (compact == want or want in compact or compact in want):
            return _norm_reg(line) or expected.strip()
        if want_fold and (folded == want_fold or want_fold in folded or folded in want_fold):
            return expected.strip()
        found = _REG_RE.findall(compact)
        if found and want and any(want == m or want in m or m in want for m in found):
            return found[0]
    for line in candidates:
        found = _REG_RE.findall(_norm_reg(line))
        if found:
            return found[0]
    return ""


def _extract_name(lines: list, expected: str) -> str:
    labeled = _after_label(lines, _NAME_LABELS)
    want_tokens = _name_tokens(expected)
    want_compact = _compact_name(expected)
    candidates = [labeled] if labeled else []
    candidates.extend(lines)
    best = ""
    best_score = 0
    for line in candidates:
        tokens = _name_tokens(line)
        if not tokens:
            continue
        compact = _norm_name(line)
        if any(label in compact for label in ("REGISTRATION", "DEPARTMENT", "COLLEGE", "SCHOOL")):
            continue
        compact_hit = 2 if want_compact and _compact_name(line) == want_compact else 0
        overlap = len(set(tokens) & set(want_tokens)) + compact_hit
        if overlap > best_score:
            best_score = overlap
            best = " ".join(tokens)
    return best


def _name_matches(expected: str, found: str) -> bool:
    a, b = _compact_name(expected), _compact_name(found)
    if a and b and (a == b or a in b or b in a):
        return True
    exp = _name_tokens(expected)
    got = _name_tokens(found)
    if not exp or not got:
        return False
    if _norm_name(expected) == _norm_name(found):
        return True
    overlap = len(set(exp) & set(got))
    return overlap >= max(2, len(exp) - 1) or (len(exp) == 1 and overlap == 1)


def _reg_matches(expected: str, found: str) -> bool:
    a, b = _norm_reg(expected), _norm_reg(found)
    if a and b and (a == b or a in b or b in a):
        return True
    fa, fb = _fold_reg(expected), _fold_reg(found)
    return bool(fa) and bool(fb) and (fa == fb or fa in fb or fb in fa)


def match_id_card_text(image: np.ndarray, expected_name: str, expected_reg: str) -> dict:
    lines = _read_lines(image)
    found_reg = _extract_reg(lines, expected_reg)
    found_name = _extract_name(lines, expected_name)
    name_ok = _name_matches(expected_name, found_name)
    reg_ok = _reg_matches(expected_reg, found_reg)
    return {
        "ocr_name": found_name,
        "ocr_reg_no": found_reg,
        "name_match": name_ok,
        "reg_match": reg_ok,
        "text_match": name_ok and reg_ok,
        "line_count": len(lines),
    }
