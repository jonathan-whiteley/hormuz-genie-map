"""Hourly AIS visibility sampler: listen to aisstream.io for one window across all regions and append raw rows.

Runs as a serverless Python job task. Rows land in <catalog>.<schema>.bronze_ais_samples; the last row of
every sample is a _heartbeat describing the listening window.
"""
from __future__ import annotations

import argparse
import sys
import uuid


def parse_args(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--catalog", required=True)
    p.add_argument("--schema", required=True)
    p.add_argument("--secret-scope", default="hormuz")
    p.add_argument("--secret-key", default="aisstream_api_key")
    p.add_argument("--seconds", type=float, default=300.0)
    p.add_argument("--max-messages", type=int, default=500000)
    p.add_argument("--src-path", default=None, help="Path to the bundle's src/ folder, added to sys.path")
    return p.parse_args(argv)


def sample(api_key, seconds, max_messages, collect=None):
    from hormuz_sources.regions import REGIONS

    if collect is None:
        from hormuz_sources.aisstream_core import collect_window as collect
    sample_id = str(uuid.uuid4())
    rows = collect(api_key, [r.bbox for r in REGIONS], seconds, max_messages)
    return sample_id, rows


def main(argv=None):
    args = parse_args(argv)
    if args.src_path:
        sys.path.insert(0, args.src_path)
    from databricks.sdk import WorkspaceClient
    from pyspark.sql import SparkSession, functions as F

    from hormuz_sources.aisstream_core import ROW_SCHEMA_DDL

    api_key = WorkspaceClient().dbutils.secrets.get(args.secret_scope, args.secret_key)
    sample_id, rows = sample(api_key, args.seconds, args.max_messages)
    spark = SparkSession.builder.getOrCreate()
    table = f"{args.catalog}.{args.schema}.bronze_ais_samples"
    (spark.createDataFrame(rows, ROW_SCHEMA_DDL)
        .withColumn("sample_id", F.lit(sample_id))
        .write.mode("append").saveAsTable(table))
    hb = rows[-1]
    print(f"sample {sample_id}: {hb[6]} messages in {(hb[5] - hb[4]).total_seconds():.0f}s, error={hb[7]} -> {table}")


if __name__ == "__main__":
    main(sys.argv[1:])
