import os
import pytest

# In-memory SQLite for high-speed isolated test runs
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.app.main import app
from backend.app.database import Base, get_db
from backend.app.seed.seed_data import seed_database
from backend.app.core.totp import get_current_totp
from backend.app.models.user import User

# In-memory SQLite for high-speed isolated test runs
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    seed_database(db)
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

def get_auth_token(client: TestClient, db_session, credential_id: str) -> str:
    """Helper to authenticate and retrieve valid JWT token for any tier."""
    user = db_session.query(User).filter(User.credential_id == credential_id).first()
    otp = None
    if user.requires_2fa and user.tfa_secret:
        otp = get_current_totp(user.tfa_secret)

    payload = {
        "credential_id": credential_id,
        "password": "Unity@2026",
    }
    if otp:
        payload["tfa_code"] = otp

    res = client.post("/api/login", json=payload)
    assert res.status_code == 200, f"Login failed for {credential_id}: {res.text}"
    return res.json()["token"]
