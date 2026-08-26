import pytest
from fastapi.testclient import TestClient
from backend.tests.conftest import get_auth_token

def test_t5_escalation_routed_to_t3(client: TestClient, db_session):
    """Tier 5 volunteer escalation routes to Tier 3."""
    t5_token = get_auth_token(client, db_session, "AM-VOL-01")
    res = client.post("/api/escalations", json={"reason": "Water rising at shelter"}, headers={"Authorization": f"Bearer {t5_token}"})
    assert res.status_code == 201
    assert res.json()["routed_to_tier"] == "T3"

def test_t4_escalation_routed_to_t2_direct_line(client: TestClient, db_session):
    """Tier 4 frontline operator escalation routes directly to Tier 2."""
    t4_token = get_auth_token(client, db_session, "NDRF-STRIKE-01")
    res = client.post("/api/escalations", json={"reason": "Need heavy machinery for road clearance"}, headers={"Authorization": f"Bearer {t4_token}"})
    assert res.status_code == 201
    assert res.json()["routed_to_tier"] == "T2"

def test_t3_forward_escalation(client: TestClient, db_session):
    """Tier 3 coordinator forwards lower escalation up to Tier 2."""
    t5_token = get_auth_token(client, db_session, "AM-VOL-01")
    t3_token = get_auth_token(client, db_session, "BHADRAK-DIST-01")

    # T5 creates escalation
    res = client.post("/api/escalations", json={"reason": "Shelter supply exhaustion"}, headers={"Authorization": f"Bearer {t5_token}"})
    esc_id = res.json()["id"]

    # T3 forwards to T2
    res_fwd = client.post(f"/api/escalations/{esc_id}/forward", json={"triage_note": "Forwarded to State EOC for airlift"}, headers={"Authorization": f"Bearer {t3_token}"})
    assert res_fwd.status_code == 200

def test_ai_aar_report_generation(client: TestClient, db_session):
    """AI Reporting layer synthesizes NIMS/NDMA compliant After-Action Report."""
    t1_token = get_auth_token(client, db_session, "NDMA-AUTH-01")
    res = client.post("/api/reports/generate-aar", json={
        "crisis_name": "Cyclone Dana",
        "operational_period": "18:00 - 06:00 IST",
        "region": "Odisha"
    }, headers={"Authorization": f"Bearer {t1_token}"})

    assert res.status_code == 200
    report = res.json()
    assert "report_id" in report
    assert "executive_summary" in report
    assert "response_metrics" in report
    assert "corrective_action_plan" in report
    assert len(report["corrective_action_plan"]) > 0

def test_simulation_mode_and_injects(client: TestClient, db_session):
    """Simulation engine switches mode, fires injects, and resets baseline."""
    t2_token = get_auth_token(client, db_session, "ODISHA-SEOC-01")
    headers = {"Authorization": f"Bearer {t2_token}"}

    # Switch to EXERCISE
    res_mode = client.post("/api/simulation/mode", json={"mode": "EXERCISE"}, headers=headers)
    assert res_mode.status_code == 200
    assert res_mode.json()["mode"] == "EXERCISE"

    # Fire Inject
    res_inj = client.post("/api/simulation/inject", json={
        "hazard_type": "Dam Seepage",
        "details": "Synthetic inject: Dam gate failure at Sector 4",
        "location": "Bhadrak"
    }, headers=headers)
    assert res_inj.status_code == 200
    assert "inject" in res_inj.json()

    # Reset
    res_reset = client.post("/api/simulation/reset", headers=headers)
    assert res_reset.status_code == 200
