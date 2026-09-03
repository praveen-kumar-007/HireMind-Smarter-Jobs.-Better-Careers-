import json
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict  # pyright: ignore [missing-import]

class Settings(BaseSettings):
    PROJECT_NAME: str = "HireMind"
    
    # Server Settings
    HOST: str = "127.0.0.1"
    PORT: int = 8000

    # Database Settings
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""
    MYSQL_DB: str = "job_assistant"
    MYSQL_HOST: str = "127.0.0.1"
    MYSQL_PORT: str = "3306"
    DATABASE_URL: str = ""

    # Redis Settings
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379

    # Security
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI & LLM Settings
    AI_PROVIDER: str = "ollama"
    
    # Groq Cloud (Ultra-Fast 300 t/s LPU)
    GROQ_API_KEY: str = ""
    GROQ_API_KEY_FALLBACK: str = ""
    GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
    GROQ_PRIMARY_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FAST_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_TIMEOUT: int = 15

    # Google Gemini (High Quota Fallback)
    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    GEMINI_PRIMARY_MODEL: str = "gemini-2.5-flash"
    GEMINI_TIMEOUT: int = 20

    # NVIDIA NIM
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_API_KEY: str = ""
    NVIDIA_API_KEY_FALLBACK: str = ""
    NVIDIA_PRIMARY_MODEL: str = "nvidia/nemotron-3-ultra-550b-a55b"
    NVIDIA_FAST_MODEL: str = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
    NVIDIA_TIMEOUT: int = 60

    # Ollama Local
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_PRIMARY_MODEL: str = "qwen3:8b"
    OLLAMA_FAST_MODEL: str = "qwen3:4b"
    OLLAMA_TIMEOUT: int = 120
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"

    # Playwright Settings
    PLAYWRIGHT_HEADLESS: bool = True
    CHROME_CDP_URL: str = "http://127.0.0.1:9222"
    TAILOR_RESUME: bool = False

    # CORS Origins
    BACKEND_CORS_ORIGINS: Union[List[str], str] = [
        "https://hire-mind-praveen.vercel.app",
        "https://hiremind-smarter-jobs-better-careers.onrender.com",
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "http://localhost:3000",
        "https://*.vercel.app",
        "https://*.onrender.com"
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            return json.loads(v)
        return v

    from pydantic import model_validator
    @model_validator(mode="after")
    def assemble_db_url(self) -> "Settings":
        if self.DATABASE_URL:
            if self.DATABASE_URL.startswith("mysql://"):
                self.DATABASE_URL = self.DATABASE_URL.replace("mysql://", "mysql+pymysql://", 1)
        elif self.MYSQL_USER:
            from urllib.parse import quote_plus
            pw = quote_plus(self.MYSQL_PASSWORD) if self.MYSQL_PASSWORD else ""
            self.DATABASE_URL = f"mysql+pymysql://{self.MYSQL_USER}:{pw}@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DB}"
        return self

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=("backend/.env", ".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
