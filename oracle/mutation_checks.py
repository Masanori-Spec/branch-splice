#!/usr/bin/env python3
"""Run real-artifact negative controls after the unmodified artifact passes.

Never mutates the source archive. Does not import the product or its tests.
"""
import argparse
import copy
import json
from pathlib import Path
import tempfile
import zipfile

from verify_package import OracleError, UnpinnedFixture, archive_entries, load_manifest, parse_json, verify_archive


def write_archive(path, entries):
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)


def run_mutations(archive_path, case_name, manifest, native_edit=False):
    baseline = verify_archive(archive_path, manifest, case_name, native_edit=native_edit)
    entries = archive_entries(archive_path)
    source_content = parse_json(entries["content/content.json"], "content/content.json")
    graph_entries = dict(entries)
    graph_content = copy.deepcopy(source_content)
    graph_content["branchingScenario"]["content"][2]["nextContentId"] = 8
    graph_entries["content/content.json"] = json.dumps(graph_content).encode()
    image_entries = dict(entries)
    nodes = source_content["branchingScenario"]["content"]
    registration = "content/" + nodes[4]["type"]["params"]["file"]["path"]
    room = "content/" + nodes[8]["type"]["params"]["file"]["path"]
    image_entries[registration] = entries[room]
    controls = []
    with tempfile.TemporaryDirectory(prefix="branchsplice-oracle-") as directory:
        for name, corrupted, expected_error in [
            ("in_bounds_graph_target", graph_entries, "node[2] targets"),
            ("collision_image_bytes", image_entries, "image_sha256")
        ]:
            path = Path(directory) / (name + ".h5p")
            write_archive(path, corrupted)
            try:
                verify_archive(path, manifest, case_name, native_edit=native_edit)
            except OracleError as error:
                if expected_error not in str(error):
                    raise OracleError(f"{name}: failed for unrelated reason: {error}") from error
                controls.append({"mutation": name, "status": "CORRECTLY_REJECTED", "reason": str(error)})
            else:
                raise OracleError(f"Oracle falsely accepted deliberate {name} corruption")
    return {"status": "PASS", "case": case_name, "variant": "native_edit" if native_edit else "original", "baseline_archive_sha256": baseline["archive_sha256"],
            "negative_controls": controls, "native_editor_player_status": "NOT_RUN_BY_THIS_ORACLE"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--case", choices=["first_splice", "shared_c"], required=True)
    parser.add_argument("--manifest", type=Path, default=Path(__file__).with_name("expected-manifest.json"))
    parser.add_argument("--report", type=Path)
    parser.add_argument("--native-edit", action="store_true", help="Verify and mutate the frozen native-edit variant")
    args = parser.parse_args()
    try:
        result = run_mutations(args.archive, args.case, load_manifest(args.manifest), native_edit=args.native_edit)
        exit_code = 0
    except (OracleError, KeyError, OSError, TypeError) as error:
        result = {"status": "BLOCKED" if isinstance(error, UnpinnedFixture) else "FAIL", "case": args.case, "variant": "native_edit" if args.native_edit else "original", "reason": str(error),
                  "native_editor_player_status": "NOT_RUN_BY_THIS_ORACLE"}
        exit_code = 2 if isinstance(error, UnpinnedFixture) else 1
    rendered = json.dumps(result, indent=2)
    print(rendered)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered + "\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
