from fastapi import WebSocket
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: Any):
        """Broadcast real-time timeline and state synchronization to all connected terminals."""
        message = {
            "type": event_type,
            "payload": data
        }
        
        # Publish via Redis Pub/Sub for multi-instance scalability
        from .redis_client import publish_event
        await publish_event("unity_eoc_events", event_type, data)

        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                dead_connections.append(connection)
                
        for dead in dead_connections:
            self.disconnect(dead)

ws_manager = WebSocketManager()
