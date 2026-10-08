import itertools
import pytest
from hormuz_sources.regions import REGIONS, Region, area_km2, region_for


def test_region_table_exact():
    assert [(r.name, r.role) for r in REGIONS] == [
        ("gulf_hormuz", "target"), ("red_sea", "target"),
        ("north_sea_channel", "control"), ("suez_east_med", "control"), ("malacca_singapore", "control"),
    ]
    assert REGIONS[0].bbox == (22.0, 47.0, 30.5, 60.0)


def test_no_overlaps_half_open_lat():
    for a, b in itertools.combinations(REGIONS, 2):
        lat_overlap = a.bbox[0] < b.bbox[2] and b.bbox[0] < a.bbox[2]
        lon_overlap = a.bbox[1] <= b.bbox[3] and b.bbox[1] <= a.bbox[3]
        assert not (lat_overlap and lon_overlap), (a.name, b.name)


@pytest.mark.parametrize("lat,lon,expected", [
    (26.5, 56.3, "gulf_hormuz"), (20.0, 38.0, "red_sea"), (29.5, 32.5, "suez_east_med"),
    (51.0, 1.5, "north_sea_channel"), (1.3, 103.8, "malacca_singapore"), (0.0, 0.0, None), (None, 10.0, None),
])
def test_region_for(lat, lon, expected):
    assert region_for(lat, lon) == expected


def test_area_km2_plausible():
    # 1 x 1 degree at the equator is about 12,364 km2
    assert area_km2((0.0, 0.0, 1.0, 1.0)) == pytest.approx(12364, rel=0.01)
    assert 5e5 < area_km2(REGIONS[2].bbox) < 1.2e6


def test_region_roles_valid():
    assert all(isinstance(r, Region) and r.role in ("target", "control") for r in REGIONS)
