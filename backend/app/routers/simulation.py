from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, AuditLog
from ..core.dependencies import require_tier
from ..services.simulation_engine import sim_engine
from ..services.websocket_manager import ws_manager

router = APIRouter(prefix="/simulation", tags=["Simulation & Virtual Drills"])

class ModeSwitchRequest(BaseModel):
    mode: str # 'LIVE' | 'EXERCISE'

class InjectRequest(BaseModel):
    hazard_type: str
    details: str
    location: str

class SeverityRequest(BaseModel):
    severity: int

@router.post("/mode")
async def switch_mode(
    req: ModeSwitchRequest,
    current_user: User = Depends(require_tier(["T1", "T2"])),
    db: Session = Depends(get_db)
):
    """Switch operational state between LIVE and EXERCISE."""
    new_mode = sim_engine.switch_mode(req.mode)
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        action="SWITCH_MODE",
        target_entity=new_mode,
        status="SWITCHED"
    ))
    db.commit()

    # Broadcast mode switch to all connected screens
    await ws_manager.broadcast("mode_changed", {"mode": new_mode})
    return {"ok": True, "mode": new_mode}

@router.post("/inject")
async def fire_inject(
    req: InjectRequest,
    current_user: User = Depends(require_tier(["T1", "T2"])),
    db: Session = Depends(get_db)
):
    """Fire a synthetic simulation hazard inject (Exercise Controller)."""
    inject = sim_engine.trigger_inject(req.hazard_type, req.details, req.location)
    
    db.add(AuditLog(
        credential_id=current_user.credential_id,
        user_id=current_user.id,
        role=current_user.role,
        action="FIRE_SIM_INJECT",
        target_entity=inject["id"],
        status="INJECT_ACTIVE"
    ))
    db.commit()

    # Broadcast inject to simulation terminals
    await ws_manager.broadcast("sim_inject", inject)
    return {"ok": True, "inject": inject}

@router.post("/reset")
async def reset_simulation(
    current_user: User = Depends(require_tier(["T1", "T2"])),
    db: Session = Depends(get_db)
):
    """Reset simulation baseline and clear active synthetic injects."""
    sim_engine.reset_baseline()
    await ws_manager.broadcast("sim_reset", {"status": "baseline_cleared"})
    return {"ok": True, "message": "Simulation reset to baseline."}
