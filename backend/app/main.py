from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from .config import settings
from .database import engine, Base, SessionLocal
from .seed.seed_data import seed_database
from .services.websocket_manager import ws_manager

# Import routers
from .routers import (
    auth,
    sites,
    tasks,
    resources,
    incidents,
    escalations,
    declarations,
    sachet,
    simulation,
    ai_reports,
    audit,
    demo,
    geo
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("unity_eoc")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize database tables and seed baseline data."""
    logger.info("Initializing Unity EOC Database tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        seed_database(db)
        logger.info("Database baseline seed complete.")
    finally:
        db.close()
        
    yield
    logger.info("Shutting down Unity EOC backend...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Sovereign Disaster Command & Operations Center API (NDMA / MHA)",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers under /api
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(sites.router, prefix=settings.API_V1_STR)
app.include_router(tasks.router, prefix=settings.API_V1_STR)
app.include_router(resources.router, prefix=settings.API_V1_STR)
app.include_router(incidents.router, prefix=settings.API_V1_STR)
app.include_router(escalations.router, prefix=settings.API_V1_STR)
app.include_router(declarations.router, prefix=settings.API_V1_STR)
app.include_router(sachet.router, prefix=settings.API_V1_STR)
app.include_router(simulation.router, prefix=settings.API_V1_STR)
app.include_router(ai_reports.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(demo.router, prefix=settings.API_V1_STR)
app.include_router(geo.router, prefix=settings.API_V1_STR)

# Real-Time WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Real-time timeline and state broadcast endpoint."""
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep-alive receive loop
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

@app.get("/")
def root():
    return {
        "system": "Unity EOC — Disaster Operations Center API",
        "version": settings.VERSION,
        "status": "ONLINE",
        "docs_url": "/docs",
        "openapi_url": "/openapi.json"
    }
