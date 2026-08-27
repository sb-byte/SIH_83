"""Initial Schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-08-27

"""
from alembic import op
import sqlalchemy as sa
from backend.app.database import Base
import backend.app.models

revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
