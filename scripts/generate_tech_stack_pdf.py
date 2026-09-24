from fpdf import FPDF

output_path = "/Users/nirmalrajkumar/projects/Attend/Attend_Tech_Stack_Table.pdf"

rows = [
    ("Layer", "Technology", "Use in Attend", "Current Version in Use"),
    ("Monorepo", "npm Workspaces", "Manages multi-app workspace (apps/*, packages/*)", "npm 10.2.0"),
    ("Build Orchestration", "Turborepo", "Runs build/dev pipelines across mobile, desktop, shared", "turbo ^2.3.0"),
    ("Language (Frontend)", "TypeScript", "Type-safe code in mobile, desktop, shared package", "^5.3.0 (root/desktop/shared), ~5.9.2 (mobile)"),
    ("Mobile Framework", "Expo", "React Native app runtime and tooling", "~54.0.0"),
    ("Mobile UI Runtime", "React Native", "Native mobile UI layer", "0.81.5"),
    ("Mobile Web/Desktop React Core", "React", "Component runtime for mobile + desktop React apps", "19.1.0"),
    ("Web Rendering", "React DOM", "Desktop React rendering in Electron renderer process", "19.1.0"),
    ("Mobile Navigation", "Expo Router", "File-based routing in mobile app", "~6.0.0"),
    ("Mobile Navigation Core", "React Navigation", "Navigation primitives underneath router", "^7.1.8"),
    ("Desktop Router", "React Router DOM", "Route management in admin desktop", "^6.21.0"),
    ("State Management", "Zustand", "Auth/session and app state (mobile + desktop)", "^4.4.0"),
    ("Server State / Caching", "TanStack Query", "API query caching and mutation handling", "^5.17.0"),
    ("HTTP Client", "Axios", "Backend API communication in clients", "^1.6.0"),
    ("Mobile Persistence", "AsyncStorage", "Stores token/user session on device", "2.2.0"),
    ("Backend Framework", "FastAPI", "REST API for auth, users, enrollment, attendance, reports", "0.109.0"),
    ("ASGI Server", "Uvicorn", "Runs FastAPI app in dev/prod", "0.27.0"),
    ("Auth Tokens", "python-jose", "JWT encode/decode for authentication", "3.3.0"),
    ("Password Hashing", "passlib + bcrypt", "Password hash verification", "passlib 1.7.4, bcrypt 4.0.1"),
    ("Multipart Uploads", "python-multipart", "Handles image/form uploads (enrollment/recognition)", "0.0.6"),
    ("Validation", "Pydantic", "Request/response data models in backend", "2.5.3"),
    ("Config", "pydantic-settings", "Environment-based backend settings", "2.1.0"),
    ("Face Detection/Embedding", "InsightFace", "Face detection + embedding extraction", "0.7.3"),
    ("Vector Search", "FAISS (CPU)", "Fast nearest-neighbor matching of face embeddings", "1.7.4"),
    ("GPU Inference Option", "onnxruntime-gpu", "Optional CUDA execution for face pipeline", ">=1.16.0"),
    ("CPU Inference", "onnxruntime", "ONNX model inference backend", ">=1.16.0"),
    ("Image Processing", "OpenCV (headless)", "Face crop, image decode/encode pipeline", "4.9.0.80"),
    ("Numeric Computing", "NumPy", "Embedding/vector operations", "1.26.3"),
    ("Data Processing", "pandas", "Attendance report shaping/export", "2.1.4"),
    ("Excel Export", "openpyxl", "Writes .xlsx reports", "3.1.2"),
    ("PDF Export", "fpdf2", "Generates PDF attendance reports", "2.7.9"),
    ("Database Service", "Supabase Postgres", "Stores users, colleges, students, embeddings, attendance", "Managed service (client SDK supabase>=2.9.0)"),
    ("Object Storage", "Supabase Storage", "Stores face images, crops, logos", "Managed service"),
    ("Desktop Shell", "Electron", "Packages/admin desktop runtime", "^28.0.0"),
    ("Desktop Bundler", "Vite", "Desktop frontend dev/build", "^5.0.0"),
    ("Electron Packaging", "electron-builder", "Builds desktop installers", "^24.9.0"),
    ("Python Runtime", "Python", "Backend runtime in Docker/dev", "3.11 (Docker image: python:3.11-slim)"),
    ("Container Orchestration", "Docker Compose", "Runs backend service with env config", "Compose spec 3.8"),
]

pdf = FPDF(orientation="L", unit="mm", format="A4")
pdf.set_auto_page_break(auto=True, margin=8)
pdf.add_page()

pdf.set_font("Helvetica", "B", 14)
pdf.cell(0, 10, "Attend - Detailed Tech Stack", ln=1)
pdf.set_font("Helvetica", "", 9)
pdf.cell(0, 6, "Generated from current workspace manifests", ln=1)
pdf.ln(2)

col_widths = [52, 42, 130, 63]
line_h = 4.8


def row_height(texts):
    max_lines = 1
    for txt, w in zip(texts, col_widths):
        chunks = pdf.multi_cell(w, line_h, txt, split_only=True)
        max_lines = max(max_lines, len(chunks))
    return max_lines * line_h


def draw_row(texts, header=False):
    h = row_height(texts)
    if pdf.get_y() + h > 200:
        pdf.add_page()
        draw_row(rows[0], header=True)
    x0 = pdf.get_x()
    y0 = pdf.get_y()
    for i, (txt, w) in enumerate(zip(texts, col_widths)):
        x = pdf.get_x()
        y = pdf.get_y()
        if header:
            pdf.set_fill_color(235, 235, 235)
            pdf.set_font("Helvetica", "B", 9)
            pdf.multi_cell(w, line_h, txt, border=1, align="L", fill=True)
        else:
            pdf.set_font("Helvetica", "", 8)
            pdf.multi_cell(w, line_h, txt, border=1, align="L")
        pdf.set_xy(x + w, y)
    pdf.set_xy(x0, y0 + h)


draw_row(rows[0], header=True)
for r in rows[1:]:
    draw_row(r)

pdf.output(output_path)
print(output_path)
