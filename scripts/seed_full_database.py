import os
import json
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.config import settings
from backend.app.database import Base, engine
from backend.app.models import (
    User, Site, Task, Resource, MutualAidCompact, Incident, CitizenSOS,
    Shelter, DangerZone, RadioChannel, VolunteerSquad, VolunteerPool,
    RumorDebunking, DamageAssessment, ICSCommandNode, HazardOverlay
)
from backend.app.seed.seed_data import seed_database

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def populate():
    print("Initializing database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_database(db)

        dump_path = os.path.join(os.path.dirname(__file__), "data_dump_full.json")
        if not os.path.exists(dump_path):
            print(f"Error: {dump_path} not found.")
            return

        with open(dump_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        print("Seeding full dataset into PostgreSQL database...")

        # 1. Incidents
        for item in data.get("chronoIncidents", []):
            inc_id = item.get("id")
            if inc_id and not db.query(Incident).filter(Incident.id == inc_id).first():
                db.add(Incident(
                    id=inc_id,
                    title=item.get("title", "Disaster Incident"),
                    details=item.get("details"),
                    section=item.get("section", "OPS"),
                    severity=item.get("severity", "MEDIUM"),
                    location=item.get("location"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site", "Bhadrak / Dhamra"),
                    lat=item.get("lat"),
                    lng=item.get("lng"),
                    status=item.get("status", "IN PROGRESS"),
                    time=item.get("time"),
                    mode=item.get("mode", "LIVE")
                ))

        # 2. Citizen SOS Queue
        for item in data.get("citizenSosQueue", []):
            sos_id = item.get("id")
            if sos_id and not db.query(CitizenSOS).filter(CitizenSOS.id == sos_id).first():
                db.add(CitizenSOS(
                    id=sos_id,
                    name=item.get("name", "Citizen"),
                    phone=item.get("phone"),
                    msg=item.get("msg", "Emergency SOS"),
                    location=item.get("location", "Coastal Sector"),
                    urgency=item.get("urgency", "CRITICAL"),
                    time=item.get("time"),
                    assigned_unit=item.get("assignedUnit", "UNASSIGNED"),
                    status=item.get("status", "PENDING"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site"),
                    lat=item.get("lat"),
                    lng=item.get("lng")
                ))

        # 3. Resources / Fleet Assets
        for item in data.get("fleetAssets", []):
            asset_id = item.get("id")
            if asset_id and not db.query(Resource).filter(Resource.id == asset_id).first():
                db.add(Resource(
                    id=asset_id,
                    name=item.get("name", "Asset"),
                    type=item.get("type", "Fleet"),
                    unit=item.get("unit"),
                    status=item.get("status", "AVAILABLE"),
                    loc=item.get("loc"),
                    crew=item.get("crew", 0),
                    fuel=item.get("fuel"),
                    battery=item.get("battery"),
                    reason=item.get("reason"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site"),
                    lat=item.get("lat"),
                    lng=item.get("lng")
                ))

        # 4. Shelters (30 shelters)
        for item in data.get("shelters", []):
            shl_id = item.get("id")
            if shl_id and not db.query(Shelter).filter(Shelter.id == shl_id).first():
                db.add(Shelter(
                    id=shl_id,
                    name=item.get("name", "Shelter"),
                    capacity=item.get("capacity", 100),
                    occupied=item.get("occupied", 0),
                    status=item.get("status", "OPEN / OPERATIONAL"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site", "Bhadrak / Dhamra"),
                    lat=item.get("lat", 20.79),
                    lng=item.get("lng", 86.96),
                    medical=item.get("medical", "Basic Aid Kit"),
                    food_rations=item.get("foodRations", "Adequate"),
                    created_by="System Seed"
                ))

        # 5. Radio Channels
        for item in data.get("radioChannels", []):
            ch_id = item.get("id")
            if ch_id and not db.query(RadioChannel).filter(RadioChannel.id == ch_id).first():
                db.add(RadioChannel(
                    id=ch_id,
                    name=item.get("name"),
                    frequency=item.get("frequency"),
                    type=item.get("type", "Tactical"),
                    allowed_tiers=item.get("allowedTiers", ["T1", "T2", "T3", "T4", "T5"]),
                    status=item.get("status", "ACTIVE")
                ))

        # 6. Volunteer Squads
        for item in data.get("volunteerSquads", []):
            sqd_id = item.get("id")
            if sqd_id and not db.query(VolunteerSquad).filter(VolunteerSquad.id == sqd_id).first():
                db.add(VolunteerSquad(
                    id=sqd_id,
                    name=item.get("name"),
                    leader=item.get("leader", "Squad Leader"),
                    members_count=item.get("membersCount", 0),
                    sector=item.get("sector", "Coastal Sector"),
                    contact=item.get("contact"),
                    status=item.get("status", "DEPLOYED"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site")
                ))

        # 7. Volunteer Pool
        for item in data.get("volunteerPool", []):
            vol_id = item.get("id")
            if vol_id and not db.query(VolunteerPool).filter(VolunteerPool.id == vol_id).first():
                db.add(VolunteerPool(
                    id=vol_id,
                    name=item.get("name"),
                    phone=item.get("phone"),
                    skills=item.get("skills"),
                    status=item.get("status", "UNASSIGNED"),
                    assigned_squad=item.get("assignedSquad"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site")
                ))

        # 8. Rumors
        for item in data.get("rumorDebunking", []):
            rmr_id = item.get("id")
            if rmr_id and not db.query(RumorDebunking).filter(RumorDebunking.id == rmr_id).first():
                db.add(RumorDebunking(
                    id=rmr_id,
                    rumor=item.get("claim") or item.get("rumor") or "Unverified Report",
                    verdict=item.get("status") or item.get("verdict") or "FALSE / DEBUNKED",
                    fact=item.get("clarification") or item.get("fact") or "Fact Verified",
                    source=item.get("verifiedBy") or item.get("source"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site")
                ))

        # 9. Mutual Aid Requests
        for item in data.get("mutualAidRequests", []):
            req_id = item.get("id")
            if req_id and not db.query(MutualAidCompact).filter(MutualAidCompact.id == req_id).first():
                db.add(MutualAidCompact(
                    id=req_id,
                    agency=item.get("agency"),
                    resource=item.get("resource"),
                    qty=item.get("qty", 1),
                    priority=item.get("priority", "HIGH"),
                    status=item.get("status", "PENDING"),
                    requested_at=item.get("requestedAt"),
                    approved_by=item.get("approvedBy")
                ))

        # 10. Damage Assessments
        for item in data.get("damageAssessments", []):
            dmg_id = item.get("id")
            if dmg_id and not db.query(DamageAssessment).filter(DamageAssessment.id == dmg_id).first():
                db.add(DamageAssessment(
                    id=dmg_id,
                    structure=item.get("sector") or item.get("type") or "Sector Infrastructure",
                    location=item.get("damage") or item.get("sector") or "Coastal Zone",
                    lat=item.get("lat"),
                    lng=item.get("lng"),
                    damage_level=item.get("severity", "MODERATE"),
                    assessed_by=item.get("reportedBy"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site")
                ))

        # 11. Tasks
        for item in data.get("icsTasksList", []):
            task_id = item.get("id")
            if task_id and not db.query(Task).filter(Task.id == task_id).first():
                db.add(Task(
                    id=task_id,
                    title=item.get("task", "Task"),
                    task=item.get("task"),
                    section=item.get("section", "Operations"),
                    assigned_to=item.get("assignee"),
                    status="completed" if item.get("completed") else "in_progress",
                    progress=100 if item.get("completed") else 50,
                    completed=bool(item.get("completed")),
                    due=item.get("due"),
                    region=item.get("region", "Odisha"),
                    site=item.get("site")
                ))

        # 12. ICS Command Tree
        tree = data.get("icsCommandTree")
        if tree and not db.query(ICSCommandNode).filter(ICSCommandNode.id == "ROOT-ICS").first():
            db.add(ICSCommandNode(
                id="ROOT-ICS",
                role=tree.get("role", "Incident Commander"),
                name=tree.get("name", "Shri R. Mohanty, IAS"),
                agency=tree.get("agency", "State EOC Odisha"),
                children_json=tree.get("children", [])
            ))

        # 13. Hazard Overlays
        overlays = [
            ("cycloneDanaInundationGeoJSON", "Cyclone Dana Storm Surge Polygon", "INUNDATION", data.get("cycloneDanaInundationGeoJSON")),
            ("assamFloodsGeoJSON", "Brahmaputra Flood Plain Overlay", "FLOOD", data.get("assamFloodsGeoJSON")),
            ("chamoliGlofGeoJSON", "Chamoli GLOF Surge Corridor", "GLOF", data.get("chamoliGlofGeoJSON")),
            ("wayanadLandslideGeoJSON", "Wayanad Landslide Debris Corridor", "LANDSLIDE", data.get("wayanadLandslideGeoJSON"))
        ]
        for overlay_id, name, cat, geojson in overlays:
            if geojson and not db.query(HazardOverlay).filter(HazardOverlay.id == overlay_id).first():
                db.add(HazardOverlay(
                    id=overlay_id,
                    name=name,
                    category=cat,
                    geojson=geojson,
                    active=1
                ))

        db.commit()
        print("SUCCESS: Full database seeding complete! All 30 shelters, incidents, assets, tasks, SOS queue, radio channels, volunteer squads, rumors, mutual aid, damage assessments, and hazard overlays are now persistent in PostgreSQL database.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    populate()
