from pyspark import pipelines as dp
from pyspark.sql import functions as F

from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import PORTS_REF as SPEC, iso3_where
from hormuz_sources.sparkutil import spec_dataframe


@dp.materialized_view(
    name="ref_portwatch_ports",
    comment="PortWatch port locations (lat/lon, H3 res 7) for Gulf and Red Sea region countries. Source: portwatch.imf.org.",
)
def ref_portwatch_ports():
    feats = fetch_features(SPEC.layer, iso3_where(spark.conf.get("hormuz.port_iso3")), SPEC.out_fields)
    rows = normalize_records(feats, SPEC.str_fields, SPEC.int_fields, SPEC.float_fields)
    return spec_dataframe(spark, SPEC, rows).withColumn("h3_res7", F.expr("h3_longlatash3(lon, lat, 7)"))
