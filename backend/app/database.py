"""Configurações e setup do banco de dados."""
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase


class Settings(BaseSettings):
    SECRET_KEY: str = "dev-secret-CHANGE-ME"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    DATABASE_URL: str = "sqlite:///./helpdesk.db"
    CORS_ORIGINS: str = "http://localhost:5500,http://127.0.0.1:5500"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# Normaliza a URL: Postgres precisa do driver psycopg2 explicitamente.
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

# SQLite precisa de connect_args; Postgres não.
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
