"""Spark-side helper: build a typed DataFrame from normalized PortWatch rows."""
from __future__ import annotations

from pyspark.sql import DataFrame, functions as F
from pyspark.sql.types import DoubleType, LongType, StringType, StructField, StructType

from hormuz_sources.portwatch import LayerSpec


def spec_schema(spec: LayerSpec) -> StructType:
    return StructType(
        [StructField(f, StringType()) for f in spec.str_fields]
        + [StructField(f, LongType()) for f in spec.int_fields]
        + [StructField(f, DoubleType()) for f in spec.float_fields]
    )


def spec_dataframe(spark, spec: LayerSpec, rows: list[dict]) -> DataFrame:
    df = spark.createDataFrame(rows, spec_schema(spec))
    if "date" in spec.str_fields:
        df = df.withColumn("date", F.to_date("date"))
    return df.withColumn("ingested_at", F.current_timestamp())
