"""Admin-only endpoints. All routes require role == 'admin'."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_role
from database import AuditRun, User, get_db
from schemas import (
    AdminStats,
    AdminUserOut,
    AdminUserUpdate,
    GenericMessage,
    PaginatedUsers,
)


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("admin"))],
)


@router.get("/users", response_model=PaginatedUsers)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> PaginatedUsers:
    total = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    offset = (page - 1) * page_size
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(page_size)
    )
    items = [AdminUserOut.model_validate(u) for u in result.scalars().all()]
    return PaginatedUsers(total=total, page=page, page_size=page_size, items=items)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminUserOut:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.role is not None:
        user.role = payload.role

    await db.commit()
    await db.refresh(user)
    return AdminUserOut.model_validate(user)


@router.delete("/users/{user_id}", response_model=GenericMessage)
async def delete_user(
    user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_admin: Annotated[User, Depends(require_role("admin"))],
) -> GenericMessage:
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot deactivate their own account.",
        )

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    await db.commit()
    return GenericMessage(message=f"User {user_id} deactivated.")


@router.get("/stats", response_model=AdminStats)
async def stats(db: Annotated[AsyncSession, Depends(get_db)]) -> AdminStats:
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    active_users = (
        await db.execute(
            select(func.count()).select_from(User).where(User.is_active.is_(True))
        )
    ).scalar_one()
    total_runs = (
        await db.execute(select(func.count()).select_from(AuditRun))
    ).scalar_one()
    avg_risk = (
        await db.execute(select(func.avg(AuditRun.overall_risk_score)))
    ).scalar() or 0.0

    return AdminStats(
        total_users=int(total_users),
        active_users=int(active_users),
        total_runs=int(total_runs),
        avg_risk_score=float(avg_risk),
    )
