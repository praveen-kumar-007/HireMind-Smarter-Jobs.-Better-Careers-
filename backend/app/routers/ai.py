from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from app.routers.deps import get_current_user_optional
from app.services.ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])

class ChatRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    provider: Optional[str] = None

class SwitchEngineRequest(BaseModel):
    provider: str

@router.get("/health")
def get_ai_health(
    db: Optional[Session] = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Verify Local AI (Ollama) and Cloud AI Engines (Groq, Gemini, NVIDIA) and report readiness."""
    user_provider = None
    if current_user and hasattr(current_user, 'profile') and current_user.profile:
        user_provider = getattr(current_user.profile, 'primary_model', None)
        if user_provider in ["local", "cloud", "ollama", "hybrid", "groq", "gemini", "nvidia"]:
            ai_service.active_provider = "local" if user_provider in ["local", "ollama"] else "cloud"

    return ai_service.check_health(active_provider_override=user_provider)

import os
import re
import logging

logger = logging.getLogger(__name__)

def persist_to_env(key: str, value: str):
    """Safely updates key=value in root .env and backend/.env files."""
    env_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env")),
        os.path.abspath(".env"),
    ]
    seen = set()
    for env_path in env_paths:
        if env_path in seen:
            continue
        seen.add(env_path)
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    content = f.read()

                pattern = rf"(?m)^{re.escape(key)}\s*=.*$"
                if re.search(pattern, content):
                    new_content = re.sub(pattern, f"{key}={value}", content)
                else:
                    new_content = content.rstrip() + f"\n{key}={value}\n"

                with open(env_path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                logger.info(f"Persisted {key}={value} in {env_path}")
            except Exception as e:
                logger.warning(f"Failed to update {key} in {env_path}: {e}")

@router.post("/switch-engine")
def switch_ai_engine(
    request: SwitchEngineRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Switch active AI engine between Local AI (Ollama) and Cloud AI APIs.
    Persists to user profile and saves directly to the .env file.
    """
    raw_target = (request.provider or "").lower().strip().strip('"').strip("'")
    if "local" in raw_target or "ollama" in raw_target:
        target = "local"
    else:
        target = "cloud"
    
    ai_service.active_provider = target
    
    # 1. Persist directly into .env file
    persist_to_env("AI_PROVIDER", target)
    
    # 2. Persist in user profile if authenticated
    if current_user and hasattr(current_user, 'profile') and current_user.profile:
        current_user.profile.primary_model = target
        db.commit()

    engine_name = ai_service._get_engine_display_name(target)
    return {
        "status": "success",
        "active_provider": target,
        "primary_engine": engine_name,
        "message": f"Active AI Engine switched to: {engine_name} and saved to .env",
        "health": ai_service.check_health(active_provider_override=target)
    }

@router.post("/chat")
def run_chat_test(request: ChatRequest):
    """Endpoint for prompt execution and reasoning validation via the selected engine."""
    try:
        answer = ai_service.ask_ai(
            prompt=request.prompt,
            model_override=request.model,
            provider_override=request.provider
        )
        return {
            "success": True,
            "engine": ai_service._get_engine_display_name(request.provider or ai_service.active_provider),
            "answer": answer
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Engine failed to respond: {str(e)}"
        )

