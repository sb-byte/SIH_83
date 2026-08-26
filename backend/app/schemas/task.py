from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class TaskCreate(BaseModel):
    title: str
    section: Optional[str] = "Operations"
    site: Optional[str] = None
    region: Optional[str] = None
    assigned_to: Optional[str] = None
    due: Optional[str] = "Operational Period 2"

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    progress: Optional[int] = None
    assigned_to: Optional[str] = None

class TaskOut(BaseModel):
    id: str
    title: str
    task: Optional[str] = None
    section: str
    site: Optional[str] = None
    region: Optional[str] = None
    assigned_to: Optional[str] = None
    status: str
    progress: int
    completed: bool
    due: Optional[str] = None

    class Config:
        from_attributes = True
