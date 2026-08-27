from sqlalchemy.orm import Session
import os
import json
import logging
from ..models import (
    User, Site, Task, Resource, MutualAidCompact, Incident, CitizenSOS, Escalation,
    Shelter, DangerZone, RadioChannel, VolunteerSquad, VolunteerPool,
    RumorDebunking, DamageAssessment, ICSCommandNode, HazardOverlay
)
from ..core.security import hash_password

logger = logging.getLogger("unity_eoc")

SEEDED_USERS = [
    {
        "credential_id": "NDMA-AUTH-01",
        "name": "Shri Rajesh Verma, IAS",
        "avatar": "🏛️",
        "role": "T1",
        "tier_name": "Tier 1 — Authority",
        "tier_level": 1,
        "jurisdiction_label": "National Command (NDMA / MHA)",
        "region": None,
        "site": None,
        "team": None,
        "requires_2fa": True,
        "tfa_secret": "JBSWY3DPEHPK3PXP",
        "salt": "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    },
    {
        "credential_id": "NDMA-AUTH-02",
        "name": "Smt. Sunita Rao, IPS",
        "avatar": "🏛️",
        "role": "T1",
        "tier_name": "Tier 1 — Authority",
        "tier_level": 1,
        "jurisdiction_label": "National Command (Ops & Logistics)",
        "region": None,
        "site": None,
        "team": None,
        "requires_2fa": True,
        "tfa_secret": "KRSXG5CTMVRXEZLU",
        "salt": "b2c3d4e5f60718293a4b5c6d7e8f90a1",
    },
    {
        "credential_id": "ODISHA-SEOC-01",
        "name": "Shri R. Mohanty, IAS",
        "avatar": "🏛️",
        "role": "T2",
        "tier_name": "Tier 2 — Strategist",
        "tier_level": 2,
        "jurisdiction_label": "State EOC Bhubaneswar (Odisha)",
        "region": "Odisha",
        "site": None,
        "team": None,
        "requires_2fa": True,
        "tfa_secret": "MZXW633PN5XW6MZX",
        "salt": "c3d4e5f60718293a4b5c6d7e8f90a1b2",
    },
    {
        "credential_id": "WB-SEOC-01",
        "name": "Dr. Anirban Sen, WBCS",
        "avatar": "🏛️",
        "role": "T2",
        "tier_name": "Tier 2 — Strategist",
        "tier_level": 2,
        "jurisdiction_label": "State EOC Nabanna (West Bengal)",
        "region": "West Bengal",
        "site": None,
        "team": None,
        "requires_2fa": True,
        "tfa_secret": "NBSWY3DPEHPK3PXP",
        "salt": "d4e5f60718293a4b5c6d7e8f90a1b2c3",
    },
    {
        "credential_id": "BHADRAK-DIST-01",
        "name": "Ms. P. Dash, OAS",
        "avatar": "⚓",
        "role": "T3",
        "tier_name": "Tier 3 — Coordinator",
        "tier_level": 3,
        "jurisdiction_label": "District Hub Bhadrak / Dhamra",
        "region": "Odisha",
        "site": "Bhadrak / Dhamra",
        "team": None,
        "requires_2fa": False,
        "tfa_secret": None,
        "salt": "e5f60718293a4b5c6d7e8f90a1b2c3d4",
    },
    {
        "credential_id": "KENDRAPARA-DIST-01",
        "name": "Shri S. K. Rout, OAS",
        "avatar": "🛶",
        "role": "T3",
        "tier_name": "Tier 3 — Coordinator",
        "tier_level": 3,
        "jurisdiction_label": "District Hub Kendrapara / Rajnagar",
        "region": "Odisha",
        "site": "Kendrapara / Rajnagar",
        "team": None,
        "requires_2fa": False,
        "tfa_secret": None,
        "salt": "f60718293a4b5c6d7e8f90a1b2c3d4e5",
    },
    {
        "credential_id": "NDRF-STRIKE-01",
        "name": "Inspector Vikram Singh",
        "avatar": "🚤",
        "role": "T4",
        "tier_name": "Tier 4 — Frontline",
        "tier_level": 4,
        "jurisdiction_label": "NDRF 03 Bn Bravo Team (Dhamra Port)",
        "region": "Odisha",
        "site": "Bhadrak / Dhamra",
        "team": "NDRF 03 Bn Bravo Team",
        "requires_2fa": False,
        "tfa_secret": None,
        "salt": "0718293a4b5c6d7e8f90a1b2c3d4e5f6",
    },
    {
        "credential_id": "SDRF-SAR-01",
        "name": "Sub-Inspector Debashis Roy",
        "avatar": "🛟",
        "role": "T4",
        "tier_name": "Tier 4 — Frontline",
        "tier_level": 4,
        "jurisdiction_label": "SDRF Water Rescue Unit 2 (Rajnagar)",
        "region": "Odisha",
        "site": "Kendrapara / Rajnagar",
        "team": "SDRF Water Rescue Unit 2",
        "requires_2fa": False,
        "tfa_secret": None,
        "salt": "18293a4b5c6d7e8f90a1b2c3d4e5f607",
    },
    {
        "credential_id": "AM-VOL-01",
        "name": "Alok Panda",
        "avatar": "🤝",
        "role": "T5",
        "tier_name": "Tier 5 — Volunteer",
        "tier_level": 5,
        "jurisdiction_label": "Aapda Mitra Volunteer (Dhamra Sector)",
        "region": "Odisha",
        "site": "Bhadrak / Dhamra",
        "team": "Aapda Mitra Team Alpha",
        "requires_2fa": False,
        "tfa_secret": None,
        "salt": "293a4b5c6d7e8f90a1b2c3d4e5f60718",
    },
    {
        "credential_id": "AM-VOL-02",
        "name": "Rasmita Jena",
        "avatar": "🩹",
        "role": "T5",
        "tier_name": "Tier 5 — Volunteer",
        "tier_level": 5,
        "jurisdiction_label": "Aapda Mitra Volunteer (Rajnagar Sector)",
        "region": "Odisha",
        "site": "Kendrapara / Rajnagar",
        "team": "Aapda Mitra Team Beta",
        "requires_2fa": False,
        "tfa_secret": None,
        "salt": "3a4b5c6d7e8f90a1b2c3d4e5f6071829",
    },
]

SEEDED_SITES = [
    { "id": "SITE-OD-BHD-01", "name": "Dhamra Port & Marine Base", "region": "Odisha", "site": "Bhadrak / Dhamra", "lat": 20.7937, "lng": 86.9634, "severity_level": "CRITICAL", "active_incidents": 4, "assigned_coordinator": "Ms. P. Dash, OAS" },
    { "id": "SITE-OD-KND-01", "name": "Rajnagar Riverine Hub", "region": "Odisha", "site": "Kendrapara / Rajnagar", "lat": 20.5732, "lng": 86.8522, "severity_level": "AMBER", "active_incidents": 2, "assigned_coordinator": "Shri S. K. Rout, OAS" },
    { "id": "SITE-WB-SND-01", "name": "Gosaba Sunderbans Delta Hub", "region": "West Bengal", "site": "Kolkata / Sunderbans", "lat": 22.1653, "lng": 88.8021, "severity_level": "YELLOW", "active_incidents": 1, "assigned_coordinator": "Dr. Anirban Sen, WBCS" }
]

def seed_database(db: Session):
    """Seed initial credentials, sites, tasks, and telemetry."""
    # Seed Users
    for u_data in SEEDED_USERS:
        existing = db.query(User).filter(User.credential_id == u_data["credential_id"]).first()
        if not existing:
            pwd_hash, _ = hash_password("Unity@2026", u_data["salt"])
            user = User(
                credential_id=u_data["credential_id"],
                name=u_data["name"],
                avatar=u_data["avatar"],
                role=u_data["role"],
                tier_name=u_data["tier_name"],
                tier_level=u_data["tier_level"],
                jurisdiction_label=u_data["jurisdiction_label"],
                region=u_data["region"],
                site=u_data["site"],
                team=u_data["team"],
                requires_2fa=u_data["requires_2fa"],
                tfa_secret=u_data["tfa_secret"],
                salt=u_data["salt"],
                password_hash=pwd_hash
            )
            db.add(user)
    
    # Seed Sites
    for s_data in SEEDED_SITES:
        existing_site = db.query(Site).filter(Site.id == s_data["id"]).first()
        if not existing_site:
            db.add(Site(**s_data))

    # Seed Initial Tasks
    default_tasks = [
        { "id": "TSK-101", "title": "Reinforce Port Seawall Embankment", "task": "Reinforce Port Seawall Embankment", "section": "Operations", "site": "Bhadrak / Dhamra", "region": "Odisha", "assigned_to": "NDRF 03 Bn Team Bravo", "status": "in_progress", "progress": 50, "completed": False, "due": "18:00 IST" },
        { "id": "TSK-102", "title": "Stage 12,000 Meal Rations at Airbase Depot", "task": "Stage 12,000 Meal Rations at Airbase Depot", "section": "Logistics", "site": "Bhadrak / Dhamra", "region": "Odisha", "assigned_to": "IAF Transit Depot", "status": "completed", "progress": 100, "completed": True, "due": "14:00 IST" },
        { "id": "TSK-103", "title": "Evacuate 14 Villagers Stranded at Rajnagar Creek", "task": "Evacuate 14 Villagers Stranded at Rajnagar Creek", "section": "Operations", "site": "Kendrapara / Rajnagar", "region": "Odisha", "assigned_to": "SDRF Water Rescue Unit 2", "status": "in_progress", "progress": 60, "completed": False, "due": "16:30 IST" },
        { "id": "TSK-104", "title": "Inspect Sunderbans Gosaba Ring-Bund", "task": "Inspect Sunderbans Gosaba Ring-Bund", "section": "Planning", "site": "Kolkata / Sunderbans", "region": "West Bengal", "assigned_to": "WBDMA Quick Response", "status": "open", "progress": 0, "completed": False, "due": "20:00 IST" }
    ]
    for t_data in default_tasks:
        if not db.query(Task).filter(Task.id == t_data["id"]).first():
            db.add(Task(**t_data))

    # Seed Initial Resources
    default_resources = [
        { "id": "NDRF-IRB-101", "name": "Inflatable Rescue Boat 01", "type": "Water Rescue", "unit": "NDRF 03 Bn", "status": "DEPLOYED", "loc": "Dhamra Port Jetty", "crew": 6, "battery": "94%", "region": "Odisha", "site": "Bhadrak / Dhamra", "lat": 20.78, "lng": 86.94 },
        { "id": "NDRF-BOAT-09", "name": "Deep Water Dinghy 09", "type": "Water Rescue", "unit": "NDRF 02 Bn", "status": "OUT_OF_SERVICE", "loc": "Cuttack Maintenance Bay", "crew": 0, "reason": "Propeller fouled with debris", "region": "Odisha", "site": "Kendrapara / Rajnagar", "lat": 20.46, "lng": 85.88 },
        { "id": "MCS-01", "name": "MCS Balasore Central High School", "type": "Shelter", "capacity": 500, "occupied": 460, "status": "NEAR FULL", "medical": "Doctor On-Duty", "food_rations": "48h Stored", "region": "Odisha", "site": "Bhadrak / Dhamra", "lat": 21.4934, "lng": 86.9135 },
        { "id": "MCS-02", "name": "MCS Kendrapara Cyclone Shelter", "type": "Shelter", "capacity": 300, "occupied": 285, "status": "CRITICAL", "medical": "Nurse Station Active", "food_rations": "72h Stored", "region": "Odisha", "site": "Kendrapara / Rajnagar", "lat": 20.5028, "lng": 86.4227 },
        { "id": "MCS-06", "name": "MCS Gosaba Sunderbans Cyclone Shelter", "type": "Shelter", "capacity": 450, "occupied": 412, "status": "NEAR FULL", "medical": "Nurse Station Active", "food_rations": "60h Stored", "region": "West Bengal", "site": "Kolkata / Sunderbans", "lat": 22.1653, "lng": 88.8021 }
    ]
    for r_data in default_resources:
        if not db.query(Resource).filter(Resource.id == r_data["id"]).first():
            db.add(Resource(**r_data))

    # Seed Initial Incidents
    default_incidents = [
        { "id": "INC-1092", "region": "Odisha", "site": "Bhadrak / Dhamra", "time": "14:24 IST", "section": "OPS", "severity": "CRITICAL", "title": "Dhamra Port Seawall Overtopped", "details": "Tidal surge of +3.2m breached secondary barrier at Dhamra port jetty.", "location": "Dhamra, Bhadrak", "lat": 20.7937, "lng": 86.9634, "status": "RESPONSE DEPLOYED" },
        { "id": "INC-1091", "region": "Odisha", "site": "Kendrapara / Rajnagar", "time": "14:18 IST", "section": "OPS", "severity": "HIGH", "title": "SDRF Water Rescue Mission", "details": "14 villagers stranded on elevated rooftop near Rajnagar creek.", "location": "Rajnagar, Kendrapara", "lat": 20.5732, "lng": 86.8522, "status": "IN PROGRESS" },
        { "id": "INC-1086", "region": "West Bengal", "site": "Kolkata / Sunderbans", "time": "12:58 IST", "section": "OPS", "severity": "HIGH", "title": "Sunderbans Embankment Breach - Gosaba", "details": "60m earthen embankment breached along Bidya river.", "location": "Gosaba, South 24 Parganas", "lat": 22.1653, "lng": 88.8021, "status": "RESPONSE DEPLOYED" }
    ]
    for inc_data in default_incidents:
        if not db.query(Incident).filter(Incident.id == inc_data["id"]).first():
            db.add(Incident(**inc_data))

    # Seed Initial Escalations
    default_escalations = [
        {
            "id": "ESC-1001",
            "origin_credential_id": "NDMA-AUTH-04",
            "origin_role": "T4",
            "routed_to_tier": "T2",
            "region": "Odisha",
            "site": "Bhadrak / Dhamra",
            "kind": "resource",
            "reason": "Requesting immediate air-lifting support & heavy winch machinery for 200 stranded civilians at Dhamra jetty.",
            "status": "pending"
        },
        {
            "id": "ESC-1002",
            "origin_credential_id": "NDMA-AUTH-03",
            "origin_role": "T3",
            "routed_to_tier": "T2",
            "region": "Odisha",
            "site": "Kendrapara / Rajnagar",
            "kind": "backup_request",
            "reason": "High-capacity dewatering pumps depleted in Rajnagar sub-division; requesting inter-state mutual aid deployment.",
            "status": "pending"
        },
        {
            "id": "ESC-1003",
            "origin_credential_id": "NDMA-AUTH-05",
            "origin_role": "T5",
            "routed_to_tier": "T3",
            "region": "West Bengal",
            "site": "Kolkata / Sunderbans",
            "kind": "general",
            "reason": "Sunderbans Gosaba shelter capacity reached 95%; requesting emergency allotment of high-capacity water purification units.",
            "status": "approved"
        }
    ]
    for esc_data in default_escalations:
        if not db.query(Escalation).filter(Escalation.id == esc_data["id"]).first():
            db.add(Escalation(**esc_data))

    # Seed rich datasets from dump file if available
    dump_candidates = [
        os.path.join(os.path.dirname(__file__), "data_dump_full.json"),
        os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "data_dump_full.json")
    ]
    for dump_path in dump_candidates:
        if os.path.exists(dump_path):
            try:
                with open(dump_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                # Shelters
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

                # Citizen SOS
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

                # Fleet Assets
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

                # Radio Channels
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

                # Volunteer Squads
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

                # Volunteer Pool
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

                # Rumors
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

                # Mutual Aid
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

                # Damage Assessments
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

                # Hazard Overlays
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
                break
            except Exception as e:
                logger.warning(f"Notice reading dump file {dump_path}: {e}")

    db.commit()

