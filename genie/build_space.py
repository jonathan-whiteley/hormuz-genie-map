"""Create or update the Hormuz Chokepoint Monitor Genie space."""
import argparse
import json
import pathlib
import subprocess
import sys

from genie.space_config import TABLES, SAMPLE_QUESTIONS, examples_for, instructions_for, table_identifiers

TITLE = "Hormuz Chokepoint Monitor"
SPACE_ID_FILE = pathlib.Path(__file__).resolve().parent / ".space_id"


def _lines(text: str) -> list[str]:
    parts = text.split("\n")
    return [p + "\n" for p in parts[:-1]] + [parts[-1]]


def serialized_space(catalog: str, schema: str, missing: frozenset[str] = frozenset()) -> dict:
    """The space definition; tables in `missing` (and the examples and instructions that use them) are left out."""
    return {
        "version": 2,
        "config": {
            "sample_questions": [
                {"id": f"1{i:031x}", "question": [q]} for i, q in enumerate(SAMPLE_QUESTIONS, 1)
            ]
        },
        "data_sources": {"tables": [{"identifier": t} for t in sorted(table_identifiers(catalog, schema, missing))]},
        "instructions": {
            "example_question_sqls": [
                {
                    "id": f"2{i:031x}",
                    "question": [q],
                    "sql": _lines(sql.format(catalog=catalog, schema=schema)),
                }
                for i, (q, sql) in enumerate(examples_for(missing), 1)
            ],
            "text_instructions": [{"id": f"3{1:031x}", "content": _lines(instructions_for(missing))}],
        },
    }


def _cli(profile: str, *args: str, json_out: bool = True, hint: str = "") -> dict:
    cmd = ["databricks", "--profile", profile, *args] + (["-o", "json"] if json_out else [])
    try:
        out = subprocess.run(cmd, check=True, capture_output=True, text=True).stdout
    except subprocess.CalledProcessError as e:
        shown = " ".join(c if len(c) < 200 else c[:200] + "..." for c in cmd)
        sys.exit(f"Command failed: {shown}\n{e.stderr}" + (f"\n{hint}" if hint else ""))
    return json.loads(out) if json_out and out.strip() else {}


def missing_tables(profile: str, catalog: str, schema: str) -> frozenset[str]:
    """Tables in TABLES that do not exist yet, for example gold_lane_recommendation without ai_decide."""
    gone = set()
    for t in TABLES:
        res = _cli(profile, "tables", "exists", f"{catalog}.{schema}.{t}",
                   hint="Check that the profile can browse the catalog and schema.")
        if not res.get("table_exists", False):
            gone.add(t)
    return frozenset(gone)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="DEFAULT")
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--schema", default="hormuz")
    ap.add_argument("--warehouse-id", required=True)
    a = ap.parse_args()

    missing = missing_tables(a.profile, a.catalog, a.schema)
    if missing == frozenset(TABLES):
        sys.exit(f"No Hormuz tables found in {a.catalog}.{a.schema}. Run the hormuz_reference pipeline first.")
    if missing:
        print("Leaving out tables that do not exist yet (and their examples): " + ", ".join(sorted(missing)))
        print("Rerun this script after they are created to add them to the space.")
    blob = json.dumps(serialized_space(a.catalog, a.schema, missing))
    desc = "Shipping through the Strait of Hormuz and nearby chokepoints and ports (IMF PortWatch, AIS-visible)."
    if SPACE_ID_FILE.exists():
        sid = SPACE_ID_FILE.read_text().strip()
        _cli(a.profile, "genie", "update-space", sid, "--json",
             json.dumps({"title": TITLE, "description": desc, "warehouse_id": a.warehouse_id,
                         "serialized_space": blob}),
             hint="If the space was deleted or you switched workspace, delete genie/.space_id "
                  "and rerun to create a new space.")
    else:
        me = _cli(a.profile, "current-user", "me")["userName"]
        parent = f"/Workspace/Users/{me}/genie_spaces"
        _cli(a.profile, "workspace", "mkdirs", parent, json_out=False)
        res = _cli(a.profile, "genie", "create-space", "--json",
                   json.dumps({"title": TITLE, "description": desc, "warehouse_id": a.warehouse_id,
                               "parent_path": parent, "serialized_space": blob}))
        sid = res["space_id"]
        SPACE_ID_FILE.write_text(sid)
    host = _cli(a.profile, "auth", "describe").get("details", {}).get("host", "").rstrip("/")
    print(f"space_id={sid}")
    print(f"url={host}/genie/rooms/{sid}")


if __name__ == "__main__":
    main()
