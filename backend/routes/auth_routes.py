"""Authentication endpoints: register / login / refresh / logout / me / change-password."""

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import (
    IS_DEV,
    blacklist_token,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from database import User, get_db
from schemas import (
    AccessTokenResponse,
    ChangePasswordRequest,
    GenericMessage,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenPair,
    UserProfile,
    UserPublic,
)

from rate_limit import limiter


router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token_pair(user: User) -> TokenPair:
    payload = {"sub": user.id, "role": user.role, "email": user.email}
    access = create_access_token(payload)
    refresh = create_refresh_token({**payload, "jti": str(uuid.uuid4())})
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        user=UserPublic.model_validate(user),
    )


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("3/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RegisterResponse:
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        is_verified=IS_DEV,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    if IS_DEV:
        access = create_access_token(
            {"sub": user.id, "role": user.role, "email": user.email}
        )
        return RegisterResponse(
            message="Account created (dev mode auto-verified).",
            user_id=user.id,
            access_token=access,
            token_type="bearer",
        )

    return RegisterResponse(
        message="Check your email to verify your account.",
        user_id=user.id,
    )


@router.post("/login", response_model=TokenPair)
@limiter.limit("5/minute")
async def login(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenPair:
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    result = await db.execute(select(User).where(User.email == form_data.username.lower()))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise invalid
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled.",
        )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    return _issue_token_pair(user)


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(
    payload: RefreshRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccessTokenResponse:
    decoded = decode_token(payload.refresh_token)
    if decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a refresh token",
        )
    user_id = decoded.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    access = create_access_token({"sub": user.id, "role": user.role, "email": user.email})
    return AccessTokenResponse(access_token=access)


@router.post("/logout", response_model=GenericMessage)
async def logout(
    payload: RefreshRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> GenericMessage:
    try:
        decoded = decode_token(payload.refresh_token)
    except HTTPException:
        # Already invalid – treat as a successful logout.
        return GenericMessage(message="Logged out")

    jti = decoded.get("jti")
    if jti:
        blacklist_token(jti)
    return GenericMessage(message="Logged out")


@router.get("/me", response_model=UserProfile)
async def me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserProfile:
    return UserProfile.model_validate(current_user)


@router.post("/change-password", response_model=GenericMessage)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GenericMessage:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    if verify_password(payload.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from the current password.",
        )

    current_user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return GenericMessage(message="Password updated successfully.")
