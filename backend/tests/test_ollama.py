import os
import sys

# Ensure backend directory is in path regardless of runner context
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from unittest.mock import patch, MagicMock
from app.services.ai_service import ai_service, select_model, extract_json_from_text
from app.routers.ai import get_ai_health

def test_model_routing():
    """Verify that task types map to the configured model names."""
    assert select_model("extraction") in ["qwen3:4b", "qwen3:8b"]
    assert select_model("field_detection") in ["qwen3:4b", "qwen3:8b"]

def test_json_extraction():
    """Test standard and regex JSON parsing logic."""
    raw_text = 'Some introductory text: {"candidate": {"name": "John Doe"}} and some ending text.'
    parsed = extract_json_from_text(raw_text)
    assert parsed["candidate"]["name"] == "John Doe"

    with pytest.raises(ValueError):
        extract_json_from_text("Invalid text with no JSON braces.")

@patch('requests.get')
@patch.object(ai_service, '_call_nvidia_api', return_value="pong")
@patch.object(ai_service.ollama_client, 'list')
def test_ollama_health_connected(mock_list, mock_nvidia, mock_get):
    """Test health check route response when Ollama is online."""
    mock_get.return_value = MagicMock(status_code=200, json=lambda: {
        "models": [
            {"name": "qwen3:4b:latest"},
            {"name": "qwen3:8b:latest"}
        ]
    })
    mock_list.return_value = {
        "models": [
            {"name": "qwen3:4b:latest"},
            {"name": "qwen3:8b:latest"}
        ]
    }
    
    response = get_ai_health()
    assert response["status"] == "ONLINE"
    assert response["ollama"]["online"] is True
    assert response["local"]["ollama_online"] is True

@patch('requests.get', side_effect=Exception("Connection refused"))
@patch.object(ai_service, '_call_nvidia_api', side_effect=Exception("API offline"))
@patch.object(ai_service.ollama_client, 'list')
def test_ollama_health_offline(mock_list, mock_nvidia, mock_get):
    """Test health check route response when Ollama is offline."""
    mock_list.side_effect = ConnectionError("Connection refused")
    
    response = get_ai_health()
    assert response["ollama"]["online"] is False
    assert response["local"]["ollama_online"] is False

@patch('requests.post')
@patch('ollama.Client.chat')
def test_ollama_chat_success(mock_chat, mock_post):
    """Verify standard completion routing call."""
    mock_post.return_value = MagicMock(status_code=200, json=lambda: {"message": {"content": "Test Answer"}})
    mock_chat.return_value = {
        "message": {"content": "Test Answer"}
    }
    
    result = ai_service.ask_ollama("Test Prompt", task_type="simple_analysis")
    assert len(result) > 0

@patch.object(ai_service, 'ask_ai')
def test_ai_question_generation(mock_ask):
    """Verify screening question generator creates human-like responses."""
    mock_ask.return_value = 'I bring hands-on development experience and adaptability.'
    
    resume_data = {"name": "Praveen", "skills": ["Python"]}
    ans = ai_service.generate_answers(
        resume_data=resume_data,
        job_title="Software Engineer",
        job_description="Need Python developer",
        question="Why should we hire you?"
    )
    assert len(ans) > 0
