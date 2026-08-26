from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from ..database import get_db
from ..models import Task, User, AuditLog
from ..schemas.task import TaskCreate, TaskUpdate, TaskOut
from ..core.dependencies import get_current_user, require_tier
from ..core.scope import filter_scoped, row_in_scope
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="/tasks", tags=["Tasks & Kanban"])

@router.get("", response_model=List[TaskOut])
def get_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve tasks scoped to user's geographic jurisdiction."""
    # Tier 4 only sees own assigned tasks
    if current_user.role == "T4":
        tasks = db.query(Task).all()
        return [
            t for t in tasks 
            if (t.assigned_to and (current_user.name in t.assigned_to or (current_user.team and current_user.team in t.assigned_to))) 
            or (t.site == current_user.site)
        ]

    # Tier 5 only sees own assigned task
    if current_user.role == "T5":
        tasks = db.query(Task).all()
        return [
            t for t in tasks 
            if (t.assigned_to and (current_user.name in t.assigned_to or "Aapda Mitra" in t.assigned_to))
            or (t.site == current_user.site)
        ]

    tasks = db.query(Task).all()
    return filter_scoped(current_user, tasks)

@router.get("/{task_id}", response_model=TaskOut)
def get_task_by_id(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve single task by ID with jurisdiction isolation."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not row_in_scope(current_user, task):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found in your assigned jurisdiction."
        )
    return task

@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(
    req: TaskCreate,
    current_user: User = Depends(require_tier(["T2", "T3"])),
    db: Session = Depends(get_db)
):
    """Create a new task (Tier 2/Tier 3 coordinators)."""
    # Enforce jurisdiction
    target_region = current_user.region if current_user.role == "T3" else (req.region or current_user.region)
    target_site = current_user.site if current_user.role == "T3" else req.site

    task_id = f"TSK-{uuid.uuid4().hex[:4].upper()}"
    new_task = Task(
        id=task_id,
        title=req.title,
        task=req.title,
        section=req.section or "Operations",
        site=target_site,
        region=target_region,
        assigned_to=req.assigned_to or "Unassigned",
        status="open",
        progress=0,
        completed=False,
        due=req.due or "Operational Period 2"
    )
    db.add(new_task)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        region=target_region,
        site=target_site,
        action="CREATE_TASK",
        target_entity=task_id,
        status="SUCCESS"
    ))
    db.commit()
    db.refresh(new_task)

    # Broadcast task creation to all terminals
    await ws_manager.broadcast("task_created", {
        "id": new_task.id,
        "title": new_task.title,
        "site": new_task.site,
        "status": new_task.status
    })

    return new_task

@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: str,
    req: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update task status, progress, or assigned squad."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task or not row_in_scope(current_user, task):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found in your assigned jurisdiction."
        )

    if req.status:
        task.status = req.status
        if req.status == "completed":
            task.completed = True
            task.progress = 100
        elif req.status == "in_progress":
            task.completed = False
            if task.progress == 0:
                task.progress = 50
        elif req.status == "open":
            task.completed = False
            task.progress = 0

    if req.progress is not None:
        task.progress = req.progress
        if task.progress >= 100:
            task.completed = True
            task.status = "completed"

    if req.assigned_to and current_user.role in ["T1", "T2", "T3"]:
        task.assigned_to = req.assigned_to

    db.commit()
    db.refresh(task)

    # Broadcast task update
    await ws_manager.broadcast("task_updated", {
        "id": task.id,
        "status": task.status,
        "progress": task.progress,
        "assigned_to": task.assigned_to
    })

    return task
