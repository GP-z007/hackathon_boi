"""Pydantic request/response schemas for the auth + admin surface."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


_PASSWORD_RULE = re.compile(r"^(?=.*[A-Z])(?=.*\d).{8,}$")


def _validate_password_strength(value: str) -> str:
    if not _PASSWORD_RULE.match(value):
        raise ValueError(
            "Password must be at least 8 characters and contain at least one "
            "uppercase letter and one number."
        )
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: str


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    api_calls_today: int
    api_calls_reset_at: date


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserPublic


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterResponse(BaseModel):
    message: str
    user_id: str
    access_token: Optional[str] = None
    token_type: Optional[str] = None


class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = Field(default=None, pattern="^(analyst|admin)$")


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    api_calls_today: int


class PaginatedUsers(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[AdminUserOut]


class AdminStats(BaseModel):
    total_users: int
    active_users: int
    total_runs: int
    avg_risk_score: float


class GenericMessage(BaseModel):
    message: str


class AuditRunSummary(BaseModel):
    run_id: str
    timestamp: str
    auto_detection: dict[str, Any]
    dataset_summary: dict[str, Any]
    bias_results: dict[str, Any]
    overall_risk_score: float
