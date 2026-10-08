"""aisstream.io websocket collector: one bounded listening window per call (pure Python, no Spark).

Every call returns the messages received plus a final heartbeat row describing the window, so
downstream logic can tell "we were not listening" apart from "a vessel stopped transmitting".
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
from datetime import datetime, timezone
from typing import Callable, Optional

WS_URL = "wss://stream.aisstream.io/v0/stream"
DEFAULT_MESSAGE_TYPES = ("PositionReport", "StandardClassBPositionReport", "ShipStaticData")
HEARTBEAT_TYPE = "_heartbeat"
ROW_SCHEMA_DDL = (
    "received_at TIMESTAMP, message_type STRING, mmsi BIGINT, payload STRING, "
    "window_start TIMESTAMP, window_end TIMESTAMP, n_messages INT, error STRING"
)


class AisStreamError(RuntimeError):
    """Fatal collector error (bad key, server-side error). Fails the pipeline on purpose."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _default_connect(url: str):
    import websockets  # permessage-deflate compression is on by default (required by aisstream since Sep 2026)

    return websockets.connect(url, open_timeout=10, max_size=2 ** 22)


def _bbox_list(bbox_or_bboxes) -> list:
    items = list(bbox_or_bboxes)
    if len(items) == 4 and all(isinstance(v, (int, float)) for v in items):
        return [tuple(items)]
    return [tuple(b) for b in items]


def build_subscription(api_key: str, bbox, message_types=DEFAULT_MESSAGE_TYPES) -> str:
    """bbox is one (lat_min, lon_min, lat_max, lon_max) tuple or a list of them."""
    if not api_key:
        raise AisStreamError("aisstream API key is empty; set secret hormuz/aisstream_api_key")
    boxes = _bbox_list(bbox)
    if not boxes:
        raise AisStreamError("at least one bounding box is required")
    return json.dumps({
        "APIKey": api_key,
        "BoundingBoxes": [[[b[0], b[1]], [b[2], b[3]]] for b in boxes],
        "FilterMessageTypes": list(message_types),
    })


def parse_message(raw) -> Optional[tuple[str, Optional[int], str]]:
    text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
    msg = json.loads(text)
    if "error" in msg:
        raise AisStreamError(f"aisstream error: {msg['error']}")
    mtype = msg.get("MessageType")
    if not mtype:
        return None
    mmsi = (msg.get("MetaData") or {}).get("MMSI")
    return mtype, (int(mmsi) if mmsi is not None else None), text


async def _collect(subscription: str, seconds: float, max_messages: int, connect, now) -> list[tuple]:
    window_start = now()
    received: list[tuple] = []
    error: Optional[str] = None
    malformed = 0
    try:
        async with connect(WS_URL) as ws:
            await ws.send(subscription)
            deadline = time.monotonic() + seconds
            while len(received) < max_messages:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                except asyncio.TimeoutError:
                    break
                try:
                    parsed = parse_message(raw)
                except (ValueError, UnicodeDecodeError, AttributeError, TypeError):
                    malformed += 1
                    continue
                if parsed:
                    received.append((now(),) + parsed)
    except AisStreamError:
        raise
    except Exception as exc:  # connection refused/dropped: keep what we have, record why the window ended
        error = f"{type(exc).__name__}: {exc}"
    window_end = now()
    if malformed > 0:
        malformed_str = f"malformed_frames={malformed}"
        error = f"{error}; {malformed_str}" if error else malformed_str
    rows = [(ts, mtype, mmsi, text, window_start, window_end, None, None) for ts, mtype, mmsi, text in received]
    rows.append((window_end, HEARTBEAT_TYPE, None, None, window_start, window_end, len(received), error))
    return rows


def _run(coro):
    """asyncio.run, but safe when called from a thread that already has a running loop (e.g. a notebook)."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    box: dict = {}

    def target():
        try:
            box["value"] = asyncio.run(coro)
        except BaseException as exc:  # re-raised in the caller's thread
            box["error"] = exc

    t = threading.Thread(target=target)
    t.start()
    t.join()
    if "error" in box:
        raise box["error"]
    return box["value"]


def collect_window(
    api_key: str,
    bbox,
    seconds: float,
    max_messages: int,
    message_types=DEFAULT_MESSAGE_TYPES,
    connect: Optional[Callable] = None,
    now: Optional[Callable[[], datetime]] = None,
) -> list[tuple]:
    subscription = build_subscription(api_key, bbox, message_types)
    return _run(_collect(subscription, seconds, max_messages, connect or _default_connect, now or _utcnow))
