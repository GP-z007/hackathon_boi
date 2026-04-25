"""Shared slowapi limiter so route-level decorators and middleware agree."""

from __future__ import annotations

from typing import Callable

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _user_or_ip_key(request: Request) -> str:
    """Use the authenticated user's id when available, else fall back to IP."""
    user = getattr(request.state, "user", None)
    if user is not None and getattr(user, "id", None):
        return f"user:{user.id}"
    return get_remote_address(request)


# Default limit applies to every route that isn't explicitly decorated.
limiter = Limiter(
    key_func=_user_or_ip_key,
    default_limits=["100/minute"],
)


def per_user_key(request: Request) -> str:
    """Explicit key function for per-user limits like /analyze."""
    return _user_or_ip_key(request)


# Re-export so other modules don't need to import from slowapi directly.
__all__: list[str] = ["limiter", "per_user_key", "Callable"]
