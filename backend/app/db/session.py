import ssl
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import pymysql
from app.core.config import settings

logger = logging.getLogger(__name__)

# Configure SSL context if connecting to TiDB Cloud or remote SSL database
is_ssl_required = (
    "tidbcloud.com" in settings.DATABASE_URL
    or "tidbcloud.com" in settings.MYSQL_HOST
    or "ssl_verify_cert" in settings.DATABASE_URL
    or settings.MYSQL_HOST not in ("127.0.0.1", "localhost")
)

connect_args = {}
if is_ssl_required:
    connect_args["ssl"] = ssl.create_default_context()

# Auto-create MySQL database if it does not exist
try:
    conn_params = {
        "host": settings.MYSQL_HOST,
        "user": settings.MYSQL_USER,
        "password": settings.MYSQL_PASSWORD,
        "port": int(settings.MYSQL_PORT)
    }
    if is_ssl_required:
        conn_params["ssl"] = ssl.create_default_context()

    conn = pymysql.connect(**conn_params)
    cursor = conn.cursor()
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{settings.MYSQL_DB}`")
    conn.commit()
    conn.close()
except Exception as e:
    logger.warning(f"Auto-creating database failed: {e}. Attempting database load anyway.")

# Create engine with connect_args for SSL if needed and high-performance cloud connection pool
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_size=20,
    max_overflow=10,
    pool_recycle=300,
    pool_timeout=30,
    pool_pre_ping=True
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base
Base = declarative_base()

# DB Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
