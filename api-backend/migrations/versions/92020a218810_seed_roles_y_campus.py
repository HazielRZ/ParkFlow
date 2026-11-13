"""seed roles y campus

Revision ID: 92020a218810
Revises: 2470abf75164
Create Date: 2026-11-12 18:18:57.089109

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '92020a218810'
down_revision: Union[str, Sequence[str], None] = '2470abf75164'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    roles = sa.table("roles", sa.column("name", sa.String))
    op.bulk_insert(roles, [{"name": n} for n in
        ["Administrador", "Vigilancia", "Estudiante", "Tech Lead", "Desarrollador"]])
    campuses = sa.table("campuses", sa.column("code", sa.String), sa.column("name", sa.String))
    op.bulk_insert(campuses, [
        {"code": "ITM-CAMPUS1", "name": "Campus 1"},
        {"code": "ITM-CAMPUS2", "name": "Campus 2"},
    ])

def downgrade() -> None:
    """Downgrade schema."""
    pass
