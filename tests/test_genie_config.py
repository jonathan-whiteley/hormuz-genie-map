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
        assert "`{catalog}`.`{schema}`." in sql


def test_tables_include_lane_and_ais_tables():
    for t in ("ref_demo_lanes", "gold_lane_status", "gold_ais_visibility_index", "ref_ais_regions"):
        assert t in TABLES


def test_sample_questions_match_spec():
    assert SAMPLE_QUESTIONS == [
        "Which of our lanes are disrupted today, and how much volume is at risk?",
        "Which alternative ports are running above their pre-war baseline?",
        "When did our container lane shift away from Jebel Ali?",
        "Which lanes have no alternative route?",
        "How do visible tanker transits through Hormuz compare with the pre-war baseline by month?",
        "How much of the Gulf can we see on AIS compared with normal shipping lanes?",
    ]


def test_example_sql_count():
    assert len(EXAMPLE_SQL) >= 6


def test_instructions_key_phrases():
    for w in ("synthetic", "assumption", "visibility, not traffic", "low_baseline"):
        assert w in INSTRUCTIONS


def test_recommendation_table_in_genie():
    assert "gold_lane_recommendation" in TABLES
    assert "never present a recommendation as certain" in INSTRUCTIONS


def test_lane_examples_select_by_primary_port_not_lane_id():
    for _, sql in EXAMPLE_SQL:
        assert "lane_id = 'L4'" not in sql
    jebel = [sql for _, sql in EXAMPLE_SQL if "Jebel Ali" in sql]
    assert len(jebel) == 3
    for sql in jebel:
        assert "primary_port = 'Jebel Ali'" in sql and "vessel_type = 'container'" in sql


def test_missing_tables_drop_their_examples_and_instructions():
    from genie.space_config import examples_for, instructions_for

    missing = frozenset({"gold_lane_recommendation"})
    ex = examples_for(missing)
    assert len(ex) == len(EXAMPLE_SQL) - 2
    assert all("gold_lane_recommendation" not in sql for _, sql in ex)
    text = instructions_for(missing)
    assert "gold_lane_recommendation" not in text
    assert "gold_lane_status" in text
    assert examples_for() == EXAMPLE_SQL and instructions_for() == INSTRUCTIONS
    assert table_identifiers("c", "s", missing) == [f"c.s.{t}" for t in TABLES if t != "gold_lane_recommendation"]


def test_serialized_space_leaves_out_missing_tables():
    from genie.build_space import serialized_space

    full = serialized_space("c", "s")
    part = serialized_space("c", "s", frozenset({"gold_lane_recommendation", "gold_ais_visibility_index"}))
    ids = [t["identifier"] for t in part["data_sources"]["tables"]]
    assert "c.s.gold_lane_recommendation" not in ids and "c.s.gold_ais_visibility_index" not in ids
    assert len(ids) == len(full["data_sources"]["tables"]) - 2
    sqls = ["".join(e["sql"]) for e in part["instructions"]["example_question_sqls"]]
    assert all("gold_lane_recommendation" not in s and "gold_ais_visibility_index" not in s for s in sqls)


def test_instructions_ask_for_place_names_with_coordinates():
    from genie.space_config import instructions_for

    text = instructions_for()
    assert "return the port or chokepoint name with lat and lon" in text
