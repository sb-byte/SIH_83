import redis.asyncio as redis
import json
import logging
from typing import Optional, Any
from ..config import settings

logger = logging.getLogger("unity_eoc.redis")

_redis_client: Any = None
_redis_checked: bool = False

async def get_redis_client() -> Optional[Any]:
    global _redis_client, _redis_checked
    if not _redis_checked:
        _redis_checked = True
        try:
            client = redis.from_url(settings.REDIS_URL, decode_responses=True)
            await client.ping()
            _redis_client = client
            logger.info("Connected to Redis Pub/Sub successfully.")
        except Exception as e:
            logger.info("Redis server not active; proceeding with in-memory broadcast mode.")
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
