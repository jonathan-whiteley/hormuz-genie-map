import requests
from pyspark import pipelines as dp

from hormuz_sources.geo import bbox_to_wkt, land_rows, parse_bbox


@dp.materialized_view(
    name="ref_land_region",
    comment="Natural Earth 1:50m land polygons clipped to the demo region, as WKT (SRID 4326). Used to flag AIS positions reported on land.",
)
def ref_land_region():
    fc = requests.get(spark.conf.get("hormuz.land_geojson_url"), timeout=120).json()
    bbox_wkt = bbox_to_wkt(parse_bbox(spark.conf.get("hormuz.bbox", "12,32,31,62")))
    df = spark.createDataFrame(land_rows(fc), "land_id INT, featurecla STRING, geojson STRING")
    return (
        df.selectExpr(
            "land_id",
            "featurecla",
            f"st_intersection(st_geomfromgeojson(geojson), st_geomfromtext('{bbox_wkt}', 4326)) AS g",
        )
        .where("NOT st_isempty(g)")
        .selectExpr("land_id", "featurecla", "st_astext(g) AS geom_wkt", "st_area(g) AS area_deg2")
    )
