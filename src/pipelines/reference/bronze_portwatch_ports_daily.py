from pyspark import pipelines as dp

from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import PORTS_DAILY as SPEC, iso3_where
from hormuz_sources.sparkutil import spec_dataframe


@dp.materialized_view(
    name="bronze_portwatch_ports_daily",
    comment="IMF PortWatch daily port calls and estimated import/export volumes (metric tons) for Gulf and Red Sea region ports. Source: portwatch.imf.org (Daily_Ports_Data).",
)
def bronze_portwatch_ports_daily():
    # Fetch one country at a time: deep resultOffset pagination on the full set times out server-side.
    since = spark.conf.get("hormuz.ports_since", "2024-01-01")
    feats = []
    for iso3 in spark.conf.get("hormuz.port_iso3").split(","):
        feats += fetch_features(SPEC.layer, iso3_where(iso3, since=since), SPEC.out_fields)
    rows = normalize_records(feats, SPEC.str_fields, SPEC.int_fields, SPEC.float_fields)
    return spec_dataframe(spark, SPEC, rows)
