"""Add advanced-analysis columns to audit_runs

Revision ID: 9a1b3c4d5e6f
Revises: 7d8d2fdb02fd
Create Date: 2026-04-25 14:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9a1b3c4d5e6f"
down_revision: Union[str, None] = "7d8d2fdb02fd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("audit_runs", schema=None) as batch_op:
        batch_op.add_column(sa.Column("dataset_path", sa.String(length=1024), nullable=True))
        batch_op.add_column(sa.Column("intersectional_analysis", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("compliance_report", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("model_card", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("lineage_log", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("audit_runs", schema=None) as batch_op:
        batch_op.drop_column("lineage_log")
        batch_op.drop_column("model_card")
        batch_op.drop_column("compliance_report")
        batch_op.drop_column("intersectional_analysis")
        batch_op.drop_column("dataset_path")
