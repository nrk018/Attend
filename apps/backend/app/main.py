from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, colleges, users, departments, subjects, students, recognize, attendance, admin, sections, registrations
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

_extra_origins = [o.strip() for o in (settings.cors_origins or "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_extra_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?|https://[a-zA-Z0-9.-]+(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# API v1 routes
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(colleges.router, prefix="/api/v1/colleges", tags=["Colleges"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(departments.router, prefix="/api/v1/departments", tags=["Departments"])
app.include_router(subjects.router, prefix="/api/v1/subjects", tags=["Subjects"])
app.include_router(students.router, prefix="/api/v1/students", tags=["Students"])
app.include_router(recognize.router, prefix="/api/v1/recognize", tags=["Recognize"])
app.include_router(attendance.router, prefix="/api/v1/attendance", tags=["Attendance"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(sections.router, prefix="/api/v1", tags=["Sections"])
app.include_router(registrations.router, prefix="/api/v1/public", tags=["Public Registration"])


@app.get("/health")
def health():
    return {"status": "ok"}
