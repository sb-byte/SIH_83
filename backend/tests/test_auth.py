import pytest
from fastapi.testclient import TestClient
from backend.app.models.user import User
from backend.app.core.totp import get_current_totp
from backend.tests.conftest import get_auth_token

def test_directory_returns_users_without_leaks(client: TestClient):
    """Verify directory returns 10 seeded users and leaks NO password hash or TOTP secret."""
    res = client.get("/api/directory")
    assert res.status_code == 200
    data = res.json()
    assert "users" in data
    assert len(data["users"]) == 10
    for u in data["users"]:
        assert "password_hash" not in u
        assert "salt" not in u
        assert "tfa_secret" not in u
        assert "credentialId" in u
        assert "tierLevel" in u

def test_t1_login_requires_2fa_challenge(client: TestClient):
    """Tier 1 without 2FA receives a tfa_required challenge."""
    res = client.post("/api/login", json={"credential_id": "NDMA-AUTH-01", "password": "Unity@2026"})
    assert res.status_code == 400
    assert res.json()["detail"]["error"] == "tfa_required"

def test_t1_login_with_valid_totp(client: TestClient, db_session):
    """Tier 1 with valid rotating TOTP logs in successfully."""
    token = get_auth_token(client, db_session, "NDMA-AUTH-01")
    assert token is not None
    assert len(token) > 20

    # Verify /api/me
    res = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    me = res.json()
    assert me["user"]["role"] == "T1"
    assert "ics" in me["permissions"]["views"]
    assert me["permissions"]["actions"]["sign_iap"]["live"] is True

def test_t5_login_no_2fa_required(client: TestClient, db_session):
    """Tier 5 volunteer logs in without 2FA challenge."""
    res = client.post("/api/login", json={"credential_id": "AM-VOL-01", "password": "Unity@2026"})
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["role"] == "T5"
    assert data["permissions"]["views"] == ["landing"]

def test_brute_force_lockout(client: TestClient):
    """Repeated wrong password attempts trigger a 429 lockout."""
    for _ in range(5):
        client.post("/api/login", json={"credential_id": "NDMA-AUTH-01", "password": "WrongPassword"})

    # 6th attempt should be locked out
    res = client.post("/api/login", json={"credential_id": "NDMA-AUTH-01", "password": "Unity@2026"})
    assert res.status_code == 429
    assert "Retry-After" in res.headers

def test_logout_revokes_token(client: TestClient, db_session):
    """Logging out invalidates the session token."""
    token = get_auth_token(client, db_session, "ODISHA-SEOC-01")
    # Verify token works
    res1 = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res1.status_code == 200

    # Logout
    res_logout = client.post("/api/logout", headers={"Authorization": f"Bearer {token}"})
    assert res_logout.status_code == 200

    # Token is now revoked
    res2 = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert res2.status_code == 401
