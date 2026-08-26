from sqlalchemy import Column, String, Integer, DateTime, Boolean
from datetime import datetime
from ..database import Base

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(50), primary_key=True, index=True)
    site = Column(String(100), nullable=True)
    region = Column(String(50), nullable=True)
    section = Column(String(50), default="Operations")
    title = Column(String(200), nullable=False)
    task = Column(String(200), nullable=True)
    assigned_to = Column(String(100), nullable=True)
    status = Column(String(20), default="open") # 'open', 'in_progress', 'completed'
    progress = Column(Integer, default=0)
    completed = Column(Boolean, default=False)
    due = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
