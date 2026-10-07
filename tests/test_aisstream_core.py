import asyncio
import json
from datetime import datetime, timezone

import pytest

from hormuz_sources.aisstream_core import (
    HEARTBEAT_TYPE, AisStreamError, WS_URL, build_subscription, collect_window, parse_message,
)

BBOX = (12.0, 32.0, 31.0, 62.0)


def pos(mmsi=123456789, mtype="PositionReport"):
    return json.dumps({"MessageType": mtype, "MetaData": {"MMSI": mmsi, "latitude": 26.5, "longitude": 56.3},
                       "Message": {mtype: {"Sog": 11.2}}})


class FakeWS:
    def __init__(self, messages, close_exc=None):
        self.messages = list(messages)
        self.sent = []
        self.close_exc = close_exc
        self.url = None

    async def send(self, m):
        self.sent.append(m)

    async def recv(self):
        if self.messages:
            return self.messages.pop(0)
        if self.close_exc:
            raise self.close_exc
        await asyncio.sleep(3600)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def connect_to(ws):
    def connect(url):
        ws.url = url
        return ws
    return connect


def test_build_subscription_shape():
    sub = json.loads(build_subscription("k", BBOX, ("PositionReport",)))
    assert sub == {"APIKey": "k", "BoundingBoxes": [[[12.0, 32.0], [31.0, 62.0]]], "FilterMessageTypes": ["PositionReport"]}


def test_empty_key_raises():
    with pytest.raises(AisStreamError, match="key"):
        build_subscription("", BBOX)


def test_parse_message_bytes_and_skip():
    assert parse_message(pos().encode())[:2] == ("PositionReport", 123456789)
    assert parse_message(json.dumps({"MetaData": {}})) is None


def test_server_error_message_raises():
    ws = FakeWS([json.dumps({"error": "Api Key Is Not Valid"})])
    with pytest.raises(AisStreamError, match="Not Valid"):
        collect_window("bad", BBOX, seconds=1, max_messages=10, connect=connect_to(ws))


def test_collect_rows_then_heartbeat():
    ws = FakeWS([pos(1), pos(2, "StandardClassBPositionReport"), json.dumps({"x": 1})])
    rows = collect_window("k", BBOX, seconds=0.3, max_messages=100, connect=connect_to(ws))
    assert ws.url == WS_URL and json.loads(ws.sent[0])["APIKey"] == "k"
    data, hb = rows[:-1], rows[-1]
    assert [(r[1], r[2]) for r in data] == [("PositionReport", 1), ("StandardClassBPositionReport", 2)]
    assert all(r[4] == hb[4] and r[5] == hb[5] for r in data)  # same window bounds on every row
    assert hb[1] == HEARTBEAT_TYPE and hb[2] is None and hb[3] is None and hb[6] == 2 and hb[7] is None
    assert hb[4] <= hb[5] and hb[4].tzinfo is not None


def test_max_messages_caps_window():
    ws = FakeWS([pos(i) for i in range(10)])
    rows = collect_window("k", BBOX, seconds=5, max_messages=3, connect=connect_to(ws))
    assert len(rows) == 4 and rows[-1][6] == 3


def test_silent_stream_returns_only_heartbeat():
    rows = collect_window("k", BBOX, seconds=0.2, max_messages=10, connect=connect_to(FakeWS([])))
    assert len(rows) == 1 and rows[0][6] == 0 and rows[0][7] is None


def test_connection_drop_keeps_rows_and_records_error():
    ws = FakeWS([pos(7)], close_exc=ConnectionResetError("peer closed"))
    rows = collect_window("k", BBOX, seconds=5, max_messages=10, connect=connect_to(ws))
    assert rows[0][2] == 7
    assert rows[-1][6] == 1 and "ConnectionResetError" in rows[-1][7]


def test_connect_failure_records_error():
    def boom(url):
        raise OSError("dns fail")
    rows = collect_window("k", BBOX, seconds=1, max_messages=10, connect=boom)
    assert len(rows) == 1 and "OSError" in rows[0][7]


def test_works_inside_running_event_loop():
    async def main():
        return collect_window("k", BBOX, seconds=0.2, max_messages=10, connect=connect_to(FakeWS([pos(9)])))
    rows = asyncio.run(main())
    assert rows[0][2] == 9


def test_uses_injected_clock():
    t = datetime(2026, 10, 7, tzinfo=timezone.utc)
    rows = collect_window("k", BBOX, seconds=0.1, max_messages=10, connect=connect_to(FakeWS([])), now=lambda: t)
    assert rows[0][0] == t and rows[0][4] == t and rows[0][5] == t
