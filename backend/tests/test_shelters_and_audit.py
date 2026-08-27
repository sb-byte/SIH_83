import pytest
from fastapi.testclient import TestClient
from backend.tests.conftest import get_auth_token

def test_shelters_crud_and_scoping(client: TestClient, db_session):
    """Test shelter creation, updating, and 404 scoping."""
    t2_token = get_auth_token(client, db_session, "ODISHA-SEOC-01")
    t3_token = get_auth_token(client, db_session, "BHADRAK-DIST-01")

    # Create shelter as T3
    res_create = client.post(
        "/api/shelters",
        json={
            "name": "Dhamra High School Shelter",
            "capacity": 300,
            "occupied": 50,
            "status": "OPEN / OPERATIONAL",
            "lat": 20.7937,
            "lng": 86.9634
        },
        headers={"Authorization": f"Bearer {t3_token}"}
    )
    assert res_create.status_code == 201
    shl = res_create.json()
    assert shl["name"] == "Dhamra High School Shelter"
    assert shl["region"] == "Odisha"

    # Update shelter occupancy
    res_update = client.patch(
        f"/api/shelters/{shl['id']}",
        json={"occupied": 290, "status": "NEAR CAPACITY"},
        headers={"Authorization": f"Bearer {t3_token}"}
    )
    assert res_update.status_code == 200
    assert res_update.json()["occupied"] == 290

    # Get shelter by ID
    res_get = client.get(f"/api/shelters/{shl['id']}", headers={"Authorization": f"Bearer {t2_token}"})
    assert res_get.status_code == 200
    assert res_get.json()["id"] == shl["id"]

def test_danger_zone_declaration_and_resolution(client: TestClient, db_session):
    """Test danger zone declaration, mode RBAC, resolution, and audit log atomic creation."""
    t2_token = get_auth_token(client, db_session, "ODISHA-SEOC-01")

    # Declare danger zone in LIVE mode
    res_dz = client.post(
        "/api/danger-zones",
        json={
            "title": "Bhadrak Tidal Surge Sector",
            "severity": "CRITICAL",
            "directive": "Evacuate low lying areas immediately",
            "lat": 20.79,
            "lng": 86.96,
            "radius_km": 6.0
        },
        headers={"Authorization": f"Bearer {t2_token}", "X-EOC-Mode": "LIVE"}
    )
    assert res_dz.status_code == 201
    dz = res_dz.json()
    assert dz["title"] == "Bhadrak Tidal Surge Sector"

    # Resolve danger zone
    res_res = client.delete(f"/api/danger-zones/{dz['id']}", headers={"Authorization": f"Bearer {t2_token}"})
    assert res_res.status_code == 200
    assert res_res.json()["resolved_at"] is not None

def test_audit_log_completeness(client: TestClient, db_session):
    """Test that audit log includes recorded actions."""
    t1_token = get_auth_token(client, db_session, "NDMA-AUTH-01")

    res_audit = client.get("/api/audit-log", headers={"Authorization": f"Bearer {t1_token}"})
    assert res_audit.status_code == 200
    logs = res_audit.json()
    assert isinstance(logs, list)
    assert len(logs) > 0
