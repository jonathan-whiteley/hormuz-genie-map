import json
import pytest
from hormuz_sources.geo import parse_bbox, bbox_to_wkt, land_rows


def test_parse_bbox_ok():
    assert parse_bbox("12,32,31,62") == (12.0, 32.0, 31.0, 62.0)
    assert parse_bbox(" 12 , 32 , 31 , 62 ") == (12.0, 32.0, 31.0, 62.0)


@pytest.mark.parametrize("bad", ["", "1,2,3", "a,b,c,d", "31,32,12,62", "12,62,31,32", "-91,0,0,10", "0,-181,10,10"])
def test_parse_bbox_rejects_bad(bad):
    with pytest.raises(ValueError):
        parse_bbox(bad)


def test_bbox_to_wkt_is_closed_lon_lat():
    assert bbox_to_wkt((12.0, 32.0, 31.0, 62.0)) == "POLYGON((32.0 12.0, 62.0 12.0, 62.0 31.0, 32.0 31.0, 32.0 12.0))"


def test_land_rows_serializes_geometry_and_skips_null():
    fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"featurecla": "Land"}, "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 0]]]}},
        {"type": "Feature", "properties": {}, "geometry": None},
        {"type": "Feature", "properties": None, "geometry": {"type": "Polygon", "coordinates": [[[2, 2], [3, 2], [3, 3], [2, 2]]]}},
    ]}
    rows = land_rows(fc)
    assert [r[0] for r in rows] == [0, 2]
    assert rows[0][1] == "Land" and rows[1][1] is None
    assert json.loads(rows[0][2])["type"] == "Polygon"
