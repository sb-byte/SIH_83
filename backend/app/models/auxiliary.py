from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON
from datetime import datetime
import uuid
from ..database import Base

class RadioChannel(Base):
    __tablename__ = "radio_channels"

    id = Column(String(50), primary_key=True) # e.g. 'CH-01'
    name = Column(String(100), nullable=False)
    frequency = Column(String(50), nullable=True, default="154.450 MHz")
    type = Column(String(50), nullable=False, default="Tactical")
    allowed_tiers = Column(JSON, nullable=False) # list of tiers ['T1', 'T2']
    status = Column(String(20), default="ACTIVE")
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)

class VolunteerSquad(Base):
    __tablename__ = "volunteer_squads"

    id = Column(String(50), primary_key=True, default=lambda: f"SQD-{uuid.uuid4().hex[:4].upper()}")
    name = Column(String(150), nullable=False)
    leader = Column(String(100), nullable=False)
    members_count = Column(Integer, default=0)
    sector = Column(String(150), nullable=False)
    contact = Column(String(100), nullable=True)
    status = Column(String(50), default="DEPLOYED")
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)

class VolunteerPool(Base):
    __tablename__ = "volunteer_pool"

    id = Column(String(50), primary_key=True, default=lambda: f"VOL-{uuid.uuid4().hex[:4].upper()}")
    name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=True)
    skills = Column(String(200), nullable=True)
    status = Column(String(50), default="UNASSIGNED") # 'UNASSIGNED', 'ASSIGNED', 'REMOVED'
    assigned_squad = Column(String(100), nullable=True)
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    registered_at = Column(DateTime, default=datetime.utcnow)

class RumorDebunking(Base):
    __tablename__ = "rumor_debunking"

    id = Column(String(50), primary_key=True, default=lambda: f"RMR-{uuid.uuid4().hex[:4].upper()}")
    rumor = Column(Text, nullable=False)
    verdict = Column(String(50), nullable=False, default="FALSE / DEBUNKED")
    fact = Column(Text, nullable=False)
    source = Column(String(150), nullable=True)
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class DamageAssessment(Base):
    __tablename__ = "damage_assessments"

    id = Column(String(50), primary_key=True, default=lambda: f"DMG-{uuid.uuid4().hex[:4].upper()}")
    structure = Column(String(200), nullable=False)
    location = Column(String(200), nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    damage_level = Column(String(50), nullable=False, default="MODERATE") # 'CRITICAL', 'SEVERE', 'MODERATE', 'MINOR'
    assessed_by = Column(String(100), nullable=True)
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    reported_at = Column(DateTime, default=datetime.utcnow)

class ICSCommandNode(Base):
    __tablename__ = "ics_command_tree"

    id = Column(String(50), primary_key=True)
    role = Column(String(100), nullable=False)
    name = Column(String(100), nullable=False)
    agency = Column(String(100), nullable=True)
    contact = Column(String(100), nullable=True)
    status = Column(String(50), default="ACTIVE")
    parent_id = Column(String(50), nullable=True)
    children_json = Column(JSON, nullable=True)
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)

class HazardOverlay(Base):
    __tablename__ = "hazard_overlays"

    id = Column(String(100), primary_key=True) # e.g. 'cycloneDanaInundationGeoJSON'
    name = Column(String(150), nullable=False)
    category = Column(String(50), nullable=False) # 'INUNDATION', 'FLOOD', 'GLOF', 'LANDSLIDE'
    region = Column(String(50), nullable=True)
    site = Column(String(100), nullable=True)
    geojson = Column(JSON, nullable=False)
    active = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
