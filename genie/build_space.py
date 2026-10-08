"""Create or update the Hormuz Chokepoint Monitor Genie space."""
import argparse
import json
import pathlib
import subprocess
import sys

from genie.space_config import EXAMPLE_SQL, INSTRUCTIONS, SAMPLE_QUESTIONS, table_identifiers

TITLE = "Hormuz Chokepoint Monitor"
SPACE_ID_FILE = pathlib.Path(__file__).resolve().parent / ".space_id"


def _lines(text: str) -> list[str]:
    parts = text.split("\n")
    return [p + "\n" for p in parts[:-1]] + [parts[-1]]


def serialized_space(catalog: str, schema: str) -> dict:
    return {
        "version": 2,
        "config": {
            "sample_questions": [
                {"id": f"1{i:031x}", "question": [q]} for i, q in enumerate(SAMPLE_QUESTIONS, 1)
            ]
        },
        "data_sources": {"tables": [{"identifier": t} for t in sorted(table_identifiers(catalog, schema))]},
        "instructions": {
            "example_question_sqls": [
                {
                    "id": f"2{i:031x}",
                    "question": [q],
                    "sql": _lines(sql.format(catalog=catalog, schema=schema)),
                }
                for i, (q, sql) in enumerate(EXAMPLE_SQL, 1)
            ],
            "text_instructions": [{"id": f"3{1:031x}", "content": _lines(INSTRUCTIONS)}],
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="DEFAULT")
    ap.add_argument("--catalog", required=True)
    ap.add_argument("--schema", default="hormuz")
    ap.add_argument("--warehouse-id", required=True)
    a = ap.parse_args()

    blob = json.dumps(serialized_space(a.catalog, a.schema))
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
