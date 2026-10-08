from datetime import date

from pyspark import pipelines as dp

from hormuz_sources.arcgis import fetch_features, normalize_records
from hormuz_sources.portwatch import CHOKEPOINTS_DAILY as SPEC, since_where
from hormuz_sources.sparkutil import spec_dataframe


@dp.materialized_view(
    name="bronze_portwatch_chokepoints_daily",
    comment="IMF PortWatch daily AIS-derived transit counts and capacity for 28 global chokepoints. Source: portwatch.imf.org (Daily_Chokepoints_Data).",
)
def bronze_portwatch_chokepoints_daily():
    since = spark.conf.get("hormuz.chokepoints_since", "2019-01-01")
    # Fetch one calendar year at a time: deep resultOffset pagination on the full set times out server-side.
    feats = []
    for year in range(int(since[:4]), date.today().year + 1):
        where = f"{since_where(max(since, f'{year}-01-01'))} AND date <= '{year}-12-31'"
        feats += fetch_features(SPEC.layer, where, SPEC.out_fields)
    rows = normalize_records(feats, SPEC.str_fields, SPEC.int_fields, SPEC.float_fields)
    return spec_dataframe(spark, SPEC, rows)
