import redis.asyncio as redis
import json
import logging
from typing import Optional, Any
from ..config import settings

logger = logging.getLogger("unity_eoc.redis")

_redis_client: Optional[redis.Redis] = None

async def get_redis_client() -> Optional[redis.Redis]:
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
            await _redis_client.ping()
            logger.info("Connected to Redis Pub/Sub successfully.")
        except Exception as e:
            logger.warning(f"Could not connect to Redis at '{settings.REDIS_URL}': {e}. Using in-memory fallback.")
            _redis_client = None
    return _redis_client

async def publish_event(channel: str, event_type: str, data: Any):
    client = await get_redis_client()
    msg = json.dumps({"type": event_type, "payload": data})
    if client:
        try:
            await client.publish(channel, msg)
        except Exception as e:
            logger.warning(f"Redis publish error: {e}")
