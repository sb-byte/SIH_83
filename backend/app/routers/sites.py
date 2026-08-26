from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Site, User
from ..core.dependencies import get_current_user
from ..core.scope import filter_scoped, row_in_scope

router = APIRouter(prefix="/sites", tags=["Operational Sites & GIS"])

@router.get("")
def get_sites(
    view: Optional[str] = Query(None, description="Projection view (aggregate or detail)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve operational sites scoped by jurisdiction and tier projection."""
    sites = db.query(Site).all()
    scoped = filter_scoped(current_user, sites)

    # Tier 1 defaults to aggregate summary view
    if current_user.role == "T1":
        if view == "detail":
            return [{"id": s.id, "name": s.name, "region": s.region, "site": s.site, "lat": s.lat, "lng": s.lng, "severity": s.severity_level, "active_incidents": s.active_incidents} for s in scoped]
        return {
            "projection": "aggregate",
            "total_sites": len(scoped),
            "regions_covered": list(set(s.region for s in scoped)),
            "severity_summary": {
                "critical": sum(1 for s in scoped if s.severity_level == "CRITICAL"),
                "amber": sum(1 for s in scoped if s.severity_level == "AMBER"),
                "yellow": sum(1 for s in scoped if s.severity_level == "YELLOW"),
                "green": sum(1 for s in scoped if s.severity_level == "GREEN")
            },
            "sites": [{"id": s.id, "name": s.name, "region": s.region, "severity": s.severity_level} for s in scoped]
        }

    # Tier 4: clamped to own site, task projection
    if current_user.role == "T4":
        return [{"id": s.id, "name": s.name, "site": s.site, "severity": s.severity_level} for s in scoped]

    # Tier 5: basic info only
    if current_user.role == "T5":
        return [{"id": s.id, "name": s.name, "site": s.site} for s in scoped]

    # Tier 2 & Tier 3: full detail
    return [{"id": s.id, "name": s.name, "region": s.region, "site": s.site, "lat": s.lat, "lng": s.lng, "severity": s.severity_level, "active_incidents": s.active_incidents, "coordinator": s.assigned_coordinator} for s in scoped]

@router.get("/{site_id}")
def get_site_by_id(
    site_id: str,
    view: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieve single site by ID with geographic isolation (cross-region -> 404)."""
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site or not row_in_scope(current_user, site):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site not found in your assigned jurisdiction."
        )

    if current_user.role == "T5":
        return {"id": site.id, "name": site.name, "site": site.site}

    return {
        "id": site.id,
        "name": site.name,
        "region": site.region,
        "site": site.site,
        "lat": site.lat,
        "lng": site.lng,
        "severity": site.severity_level,
        "active_incidents": site.active_incidents,
        "coordinator": site.assigned_coordinator
    }
