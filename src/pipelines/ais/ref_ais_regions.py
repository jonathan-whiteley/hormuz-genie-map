from pyspark import pipelines as dp

from hormuz_sources.regions import REGIONS, area_km2


@dp.materialized_view(
    name="ref_ais_regions",
    comment="AIS sampling regions: Gulf targets and busy control lanes, with bounding boxes and area. Latitude bounds are half-open [lat_min, lat_max).",
)
def ref_ais_regions():
    rows = [(r.name, r.role, r.label, *r.bbox, area_km2(r.bbox)) for r in REGIONS]
    return spark.createDataFrame(
        rows,
        "region STRING, role STRING, label STRING, lat_min DOUBLE, lon_min DOUBLE, lat_max DOUBLE, lon_max DOUBLE, area_km2 DOUBLE",
    )
