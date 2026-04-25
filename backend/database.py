"""Async SQLAlchemy setup and ORM models for the bias-audit backend."""

from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timezone
from typing import AsyncGenerator

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./bias_audit.db")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return _utcnow().date()


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Base(AsyncAttrs, DeclarativeBase):
    """Declarative base for all ORM models."""


class User(Base):
    __tablename__ = "users"

    # Stored as TEXT (UUID4) so SQLite + Postgres both work without a custom type.
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="analyst", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    last_login: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    api_calls_today: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    api_calls_reset_at: Mapped[date] = mapped_column(Date, default=_today, nullable=False)

    audit_runs: Mapped[list["AuditRun"]] = relationship(
        "AuditRun", back_populates="user", cascade="all, delete-orphan"
    )


class AuditRun(Base):
    __tablename__ = "audit_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overall_risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    auto_detected_label: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    auto_detected_attrs: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    bias_results: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    dataset_summary: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    user: Mapped[User] = relationship("User", back_populates="audit_runs")


# SQLite needs check_same_thread=False for async usage; harmless on other backends.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args=_connect_args,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a managed async session."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create tables if they do not yet exist (used as an Alembic fallback)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
