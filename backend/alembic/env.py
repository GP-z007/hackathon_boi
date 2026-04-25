"""Alembic environment configured for the bias-audit backend.

We import the SQLAlchemy declarative `Base` from the application so
`alembic revision --autogenerate` can diff the live model graph against
the database schema. The runtime app uses an async aiosqlite driver; the
migration tooling rewrites that to the sync `sqlite` driver because Alembic
runs migrations synchronously.
"""

from __future__ import annotations

import os
import pathlib
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Ensure backend/ is on sys.path so `import database` works regardless of CWD.
HERE = pathlib.Path(__file__).resolve().parent
BACKEND_ROOT = HERE.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from database import Base  # noqa: E402  (must come after sys.path tweak)
import database  # noqa: F401,E402  (registers all models on Base.metadata)


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _resolve_database_url() -> str:
    """Pull DATABASE_URL from env, then convert async drivers to sync drivers.

    Also normalises `postgres://` (Render/Heroku) and bare `postgresql://`
    URLs so Alembic never blows up on a scheme SQLAlchemy 2 rejects.
    """
    url = os.getenv("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
    if not url:
        url = "sqlite:///./bias_audit.db"
    # Render / Heroku expose postgres://; rewrite to the canonical scheme.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    # Alembic itself runs synchronously; downgrade async drivers transparently.
    url = url.replace("+aiosqlite", "")
    url = url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    return url


config.set_main_option("sqlalchemy.url", _resolve_database_url())
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
