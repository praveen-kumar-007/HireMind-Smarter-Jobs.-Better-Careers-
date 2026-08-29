from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.services.ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])

class ChatRequest(BaseModel):
    prompt: str
    model: Optional[str] = None

@router.get("/health")
def get_ai_health():
    """Verify NVIDIA NIM Engine and local Ollama fallback readiness."""
    health_info = ai_service.check_health()
    return health_info

@router.post("/chat")
def run_chat_test(request: ChatRequest):
    """Endpoint for prompt execution and reasoning validation via NVIDIA NIM."""
    try:
        answer = ai_service.ask_ai(
            prompt=request.prompt,
            model_override=request.model
        )
        return {
            "success": True,
            "engine": "NVIDIA NIM",
            "model": request.model or ai_service.nvidia_primary_model,
            "answer": answer
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI Engine failed to respond: {str(e)}"
        )

