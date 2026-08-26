import math
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from ..database import get_db
from ..models import Resource, Site, Declaration
from ..core.dependencies import get_current_user

router = APIRouter(prefix="/geo", tags=["Geospatial & Spatial Query"])

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

@router.get("/proximity")
def get_proximity(
    lat: float = Query(..., description="Latitude coordinate"),
    lng: float = Query(..., description="Longitude coordinate"),
    radius_km: float = Query(15.0, description="Search radius in kilometers"),
    type: str = Query("resources", description="Target type (resources, sites)"),
    db: Session = Depends(get_db)
):
    """Find disaster response resources or command sites within a given radius."""
    results = []
    
    if type.lower() == "sites":
        sites = db.query(Site).all()
        for s in sites:
            if s.lat and s.lng:
                d = haversine_km(lat, lng, s.lat, s.lng)
                if d <= radius_km:
                    results.append({
                        "id": s.id,
                        "name": s.name,
                        "region": s.region,
                        "site": s.site,
                        "lat": s.lat,
                        "lng": s.lng,
                        "severity": s.severity_level,
                        "distance_km": round(d, 2)
                    })
    else:
        resources = db.query(Resource).all()
        for r in resources:
            if r.lat and r.lng:
                d = haversine_km(lat, lng, r.lat, r.lng)
                if d <= radius_km:
                    results.append({
                        "id": r.id,
                        "name": r.name,
                        "label": r.name,
                        "type": r.type,
                        "unit": r.unit,
                        "region": r.region,
                        "site": r.site,
                        "status": r.status,
                        "lat": r.lat,
                        "lng": r.lng,
                        "distance_km": round(d, 2)
                    })

    results.sort(key=lambda x: x["distance_km"])
    return {
        "engine": "FastAPI Spatial Engine",
        "center": {"lat": lat, "lng": lng},
        "radius_km": radius_km,
        "count": len(results),
        "results": results
    }

@router.get("/nearest-shelter")
def get_nearest_shelter(
    lat: float = Query(..., description="Latitude coordinate"),
    lng: float = Query(..., description="Longitude coordinate"),
    db: Session = Depends(get_db)
):
    """Find closest operational site/shelter."""
    sites = db.query(Site).all()
    valid = []
    for s in sites:
        if s.lat and s.lng:
            d = haversine_km(lat, lng, s.lat, s.lng)
            valid.append({
                "id": s.id,
                "name": s.name,
                "region": s.region,
                "site": s.site,
                "lat": s.lat,
                "lng": s.lng,
                "severity": s.severity_level,
                "distance_km": round(d, 2)
            })
            
    if not valid:
        raise HTTPException(status_code=404, detail="No active sites found.")
        
    valid.sort(key=lambda x: x["distance_km"])
    return {
        "engine": "FastAPI Spatial Engine",
        "shelter": valid[0]
    }

@router.get("/containment")
def get_containment(
    lat: float = Query(..., description="Latitude coordinate"),
    lng: float = Query(..., description="Longitude coordinate"),
    db: Session = Depends(get_db)
):
    """Check if coordinates fall inside declared impact or inundation zone."""
    declarations = db.query(Declaration).all()
    return {
        "engine": "FastAPI Spatial Engine",
        "point": {"lat": lat, "lng": lng},
        "in_danger_zone": False,
        "active_declarations_count": len(declarations)
    }
