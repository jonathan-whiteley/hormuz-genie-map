from genie.space_config import TABLES, INSTRUCTIONS, SAMPLE_QUESTIONS, EXAMPLE_SQL, table_identifiers


def test_tables_are_fully_qualified_and_in_schema():
    ids = table_identifiers("jdub_demo", "hormuz")
    assert ids == [f"jdub_demo.hormuz.{t}" for t in TABLES]
    assert "gold_chokepoint_daily" in TABLES and "gold_port_daily" in TABLES and "ref_conflict_events" in TABLES


def test_text_has_no_em_or_en_dashes():
    blob = INSTRUCTIONS + "".join(SAMPLE_QUESTIONS) + "".join(q + s for q, s in EXAMPLE_SQL)
    assert "—" not in blob and "–" not in blob


def test_example_sql_reference_only_known_tables():
    for _, sql in EXAMPLE_SQL:
        assert "jdub_demo.hormuz." not in sql  # templated with {catalog}.{schema}
        assert "{catalog}.{schema}." in sql
