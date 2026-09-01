import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import SessionLocal
from app.db.init_db import init_db
from app.routers import auth, resume, jobs, match, applications, analytics, ai, credentials, outreach, admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("app.main")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Production-ready AI-powered Job Assistant platform backend.",
    version="1.3.0"
)

# CORS Configuration
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.BACKEND_CORS_ORIGINS],
        allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Startup DB initialisation
@app.on_event("startup")
def on_startup():
    logger.info("Initializing database...")
    db = SessionLocal()
    try:
        init_db(db)
        logger.info("Database initialized successfully.")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
    finally:
        db.close()

    # On cloud / Linux startup, ensure Playwright Chromium binary is installed
    import sys
    if sys.platform != "win32":
        try:
            import subprocess
            logger.info("Ensuring Playwright Chromium binaries are available for cloud automation...")
            subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=False)
        except Exception as e_pw:
            logger.warning(f"Playwright cloud initialization notice: {e_pw}")

# Router Mounts
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(resume.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(match.router, prefix="/api")
app.include_router(applications.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(credentials.router, prefix="/api")
app.include_router(outreach.router, prefix="/api")

# User endpoints alias for frontend / extension compatibility
from app.models.user import User
from app.schemas.auth import UserResponse
from app.routers.deps import get_current_user
from fastapi import Depends

@app.get("/api/users/me", response_model=UserResponse, tags=["users"])
def get_user_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "api_docs": "/docs"
    }
# Reload trigger: 2026-08-27-17:42
