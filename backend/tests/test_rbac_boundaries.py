import pytest
from fastapi.testclient import TestClient
from backend.tests.conftest import get_auth_token

def test_boundary_1_t5_cannot_touch_resources(client: TestClient, db_session):
    """Boundary #1 — Tier 5 can never touch resources."""
    t5_token = get_auth_token(client, db_session, "AM-VOL-01")
    headers = {"Authorization": f"Bearer {t5_token}"}

    # GET /api/resources -> 403
    res1 = client.get("/api/resources", headers=headers)
    assert res1.status_code == 403

    # GET /api/resources/:id -> 403
    res2 = client.get("/api/resources/NDRF-IRB-101", headers=headers)
    assert res2.status_code == 403

    # POST /api/resources -> 403
    res3 = client.post("/api/resources", json={"id": "FORGED-01", "name": "Fake Boat", "type": "Water Rescue", "status": "AVAILABLE"}, headers=headers)
    assert res3.status_code == 403

    # POST /api/resource-requests -> 403
    res4 = client.post("/api/resource-requests", json={"type": "Boat", "label": "1x Boat", "reason": "Flood"}, headers=headers)
    assert res4.status_code == 403

def test_boundary_2_t4_isolated_task_projection(client: TestClient, db_session):
    """Boundary #2 — Tier 4 frontline operators cannot read full incident feeds."""
    t4_token = get_auth_token(client, db_session, "NDRF-STRIKE-01")
    headers = {"Authorization": f"Bearer {t4_token}"}

    # GET /api/incidents -> 403
    res = client.get("/api/incidents", headers=headers)
    assert res.status_code == 403

def test_boundary_3_only_t1_t2_approve_escalations(client: TestClient, db_session):
    """Boundary #3 — Only Tier 1/Tier 2 can approve/deny escalations."""
    t3_token = get_auth_token(client, db_session, "BHADRAK-DIST-01")
    t4_token = get_auth_token(client, db_session, "NDRF-STRIKE-01")
    t5_token = get_auth_token(client, db_session, "AM-VOL-01")
    t2_token = get_auth_token(client, db_session, "ODISHA-SEOC-01")

    # Create an escalation from T5
    res_esc = client.post("/api/escalations", json={"kind": "backup_request", "reason": "Severe overflow at jetty"}, headers={"Authorization": f"Bearer {t5_token}"})
    assert res_esc.status_code == 201
    esc_id = res_esc.json()["id"]

    # T3 cannot approve -> 403
    assert client.post(f"/api/escalations/{esc_id}/approve", headers={"Authorization": f"Bearer {t3_token}"}).status_code == 403

    # T4 cannot approve -> 403
    assert client.post(f"/api/escalations/{esc_id}/approve", headers={"Authorization": f"Bearer {t4_token}"}).status_code == 403

    # T5 cannot approve -> 403
    assert client.post(f"/api/escalations/{esc_id}/approve", headers={"Authorization": f"Bearer {t5_token}"}).status_code == 403

    # T2 (in-region) approves -> 200
    res_app = client.post(f"/api/escalations/{esc_id}/approve", headers={"Authorization": f"Bearer {t2_token}"})
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "approved"

    # Re-actioning already actioned request -> 409
    assert client.post(f"/api/escalations/{esc_id}/approve", headers={"Authorization": f"Bearer {t2_token}"}).status_code == 409

def test_boundary_4_only_t1_issues_declarations(client: TestClient, db_session):
    """Boundary #4 — Only Tier 1 Authority may issue statutory declarations."""
    t1_token = get_auth_token(client, db_session, "NDMA-AUTH-01")
    t2_token = get_auth_token(client, db_session, "ODISHA-SEOC-01")
    t3_token = get_auth_token(client, db_session, "BHADRAK-DIST-01")
    t5_token = get_auth_token(client, db_session, "AM-VOL-01")

    # T2 POST /api/declarations -> 403
    assert client.post("/api/declarations", json={"title": "Emergency Declaration"}, headers={"Authorization": f"Bearer {t2_token}"}).status_code == 403

    # T3 POST /api/declarations -> 403
    assert client.post("/api/declarations", json={"title": "Emergency Declaration"}, headers={"Authorization": f"Bearer {t3_token}"}).status_code == 403

    # T5 GET /api/declarations -> 403
    assert client.get("/api/declarations", headers={"Authorization": f"Bearer {t5_token}"}).status_code == 403

    # T1 POST /api/declarations -> 201
    res = client.post("/api/declarations", json={"title": "Operational Period 2 IAP Digital Declaration", "scope": "National"}, headers={"Authorization": f"Bearer {t1_token}"})
    assert res.status_code == 201
    assert "data" in res.json()

def test_boundary_5_geographic_jurisdiction_isolation(client: TestClient, db_session):
    """Boundary #5 — Jurisdiction isolation prevents cross-state and cross-district leaks."""
    t2_odisha = get_auth_token(client, db_session, "ODISHA-SEOC-01")
    t3_bhadrak = get_auth_token(client, db_session, "BHADRAK-DIST-01")

    # T2(Odisha) GET West Bengal site by ID -> 404
    res1 = client.get("/api/sites/SITE-WB-SND-01", headers={"Authorization": f"Bearer {t2_odisha}"})
    assert res1.status_code == 404

    # T3(Bhadrak) GET West Bengal task by ID -> 404
    res2 = client.get("/api/tasks/TSK-104", headers={"Authorization": f"Bearer {t3_bhadrak}"})
    assert res2.status_code == 404

    # T2(Odisha) incident feed contains only Odisha rows
    res_inc = client.get("/api/incidents", headers={"Authorization": f"Bearer {t2_odisha}"})
    assert res_inc.status_code == 200
    rows = res_inc.json()
    assert len(rows) > 0
    for r in rows:
        assert r["region"] == "Odisha"
