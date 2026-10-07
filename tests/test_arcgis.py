import pytest
from hormuz_sources.arcgis import ArcGisError, fetch_features, layer_query_url, normalize_records


def pager(pages, exceeded=None):
    """Fake get_json returning successive pages; records every params dict."""
    calls = []
    def get_json(url, params):
        calls.append(dict(params))
        i = len(calls) - 1
        feats = pages[i] if i < len(pages) else []
        body = {"features": [{"attributes": a} for a in feats]}
        if exceeded and i < len(exceeded):
            body["exceededTransferLimit"] = exceeded[i]
        return body
    return get_json, calls


def test_layer_query_url():
    assert layer_query_url("Daily_Chokepoints_Data").endswith("/Daily_Chokepoints_Data/FeatureServer/0/query")


def test_fetch_paginates_until_short_page():
    get_json, calls = pager([[{"x": i} for i in range(3)], [{"x": i} for i in range(3, 6)], [{"x": 6}]])
    out = fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=3)
    assert [r["x"] for r in out] == list(range(7))
    assert [c["resultOffset"] for c in calls] == [0, 3, 6]
    assert calls[0]["outFields"] == "x" and calls[0]["orderByFields"] == "ObjectId" and calls[0]["f"] == "json"


def test_fetch_advances_by_rows_returned_when_server_caps():
    # server caps at 2 rows although we ask for 3, signalling more via exceededTransferLimit
    get_json, calls = pager([[{"x": 0}, {"x": 1}], [{"x": 2}, {"x": 3}], [{"x": 4}]], exceeded=[True, True, False])
    out = fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=3)
    assert [r["x"] for r in out] == [0, 1, 2, 3, 4]
    assert [c["resultOffset"] for c in calls] == [0, 2, 4]


def test_fetch_stops_on_empty_page_even_if_exceeded_flag():
    get_json, calls = pager([[{"x": 0}], []], exceeded=[True, True])
    assert fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=3) == [{"x": 0}]
    assert len(calls) == 2


def test_fetch_raises_on_error_body():
    def get_json(url, params):
        return {"error": {"code": 400, "message": "Invalid query"}}
    with pytest.raises(ArcGisError, match="Invalid query"):
        fetch_features("L", "bad", ["x"], get_json=get_json)


def test_fetch_raises_when_max_pages_exceeded():
    get_json, _ = pager([[{"x": 1}]] * 10, exceeded=[True] * 10)
    with pytest.raises(ArcGisError, match="max_pages"):
        fetch_features("L", "1=1", ["x"], get_json=get_json, page_size=1, max_pages=3)


def test_normalize_coerces_ints_floats_and_nulls():
    rows = normalize_records(
        [{"date": "2026-10-04", "n_total": 4.0, "capacity": 0, "extra": "drop me"}, {"date": None}],
        str_fields=("date",), int_fields=("n_total",), float_fields=("capacity",),
    )
    assert rows[0] == {"date": "2026-10-04", "n_total": 4, "capacity": 0.0}
    assert isinstance(rows[0]["capacity"], float) and isinstance(rows[0]["n_total"], int)
    assert rows[1] == {"date": None, "n_total": None, "capacity": None}


def test_normalize_stringifies_non_string_str_fields():
    assert normalize_records([{"portid": 6}], str_fields=("portid",)) == [{"portid": "6"}]
