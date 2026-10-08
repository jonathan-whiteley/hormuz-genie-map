import uuid
from hormuz_sources.regions import REGIONS
from jobs.ais_sampler import parse_args, sample


def test_sample_listens_to_every_region_and_tags_id():
    seen = {}

    def fake_collect(api_key, bboxes, seconds, max_messages):
        seen.update(api_key=api_key, bboxes=bboxes, seconds=seconds, max_messages=max_messages)
        return [("row",), ("heartbeat",)]

    sample_id, rows = sample("k", 300.0, 1000, collect=fake_collect)
    uuid.UUID(sample_id)
    assert rows == [("row",), ("heartbeat",)]
    assert seen == {"api_key": "k", "bboxes": [r.bbox for r in REGIONS], "seconds": 300.0, "max_messages": 1000}


def test_parse_args_defaults():
    a = parse_args(["--catalog", "c", "--schema", "s"])
    assert (a.catalog, a.schema, a.secret_scope, a.secret_key, a.seconds, a.max_messages, a.src_path) == (
        "c", "s", "hormuz", "aisstream_api_key", 300.0, 500000, None)
