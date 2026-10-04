#!/usr/bin/env python3
"""Independent, read-only H5P ZIP/JSON oracle. Python standard library only.

No merge engine, native authoring code, browser code, or product helpers are used.
A PASS is a static archive assertion, never evidence of native editor/player use.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile

HERE = Path(__file__).resolve().parent
DEFAULT_MANIFEST = HERE / "expected-manifest.json"
MAX_UNCOMPRESSED = 256 * 1024 * 1024


class OracleError(ValueError):
    pass


class UnpinnedFixture(OracleError):
    pass


def require(condition, message):
    if not condition:
        raise OracleError(message)


def same(actual, expected, location):
    require(actual == expected, f"{location}: expected {expected!r}; got {actual!r}")


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value, f"Duplicate JSON key: {key!r}")
        value[key] = item
    return value


def parse_json(data, location):
    try:
        result = json.loads(data, object_pairs_hook=unique_object)
    except (ValueError, UnicodeDecodeError) as error:
        raise OracleError(f"{location}: {error}") from error
    require(isinstance(result, dict), f"{location}: expected a JSON object")
    return result


def load_manifest(path=DEFAULT_MANIFEST):
    return parse_json(Path(path).read_bytes(), str(path))


def safe_path(path, location):
    require(isinstance(path, str) and path, f"{location}: missing path")
    require(not any(c in path for c in "\\\x00?#:"), f"{location}: unsafe or remote path {path!r}")
    parts = path.split("/")
    require(not path.startswith("/") and all(p not in ("", ".", "..") for p in parts),
            f"{location}: non-canonical path {path!r}")
    require(str(PurePosixPath(path)) == path, f"{location}: non-canonical path")
    return path


def archive_entries(path):
    """Read entries without extracting anything or using the product ZIP reader."""
    try:
        with zipfile.ZipFile(path) as archive:
            entries = {}
            total = 0
            for item in archive.infolist():
                name = item.filename.rstrip("/") if item.is_dir() else item.filename
                safe_path(name, "ZIP entry")
                require(name not in entries, f"Duplicate ZIP entry: {name}")
                require(not (item.flag_bits & 1), f"Encrypted ZIP entry: {name}")
                total += item.file_size
                require(total <= MAX_UNCOMPRESSED, "Archive exceeds oracle's bounded uncompressed size")
                entries[name] = b"" if item.is_dir() else archive.read(item)
            return entries
    except (zipfile.BadZipFile, OSError, RuntimeError) as error:
        raise OracleError(f"Cannot read archive: {error}") from error


def assert_no_feedback(feedback, location):
    require(feedback is None or isinstance(feedback, dict), f"{location}: invalid feedback")
    if feedback:
        for key in ("title", "subtitle", "image"):
            require(not feedback.get(key), f"{location}.{key}: unexpected visible custom feedback")
        require("endScreenScore" not in feedback, f"{location}: endScreenScore presence triggers a custom ending")


def integer_target(target, location, count):
    require(type(target) is int, f"{location}: target must be an integer")
    require(target == -1 or 0 <= target < count, f"{location}: invalid target {target}")
    return target


def read_node(node, index, expected, count, entries, manifest, case):
    location = f"node[{index}]"
    require(isinstance(node, dict), f"{location}: expected object")
    kind = node.get("type")
    require(isinstance(kind, dict), f"{location}.type: expected object")
    same(kind.get("library"), expected["library"], f"{location}.type.library")
    params = kind.get("params")
    require(isinstance(params, dict), f"{location}.type.params: expected object")
    require(node.get("showContentTitle") in (None, False), f"{location}: unexpected visible content title")
    assert_no_feedback(node.get("feedback"), f"{location}.feedback")
    image_record = None
    choices = []
    if expected["library"] == "H5P.AdvancedText 1.1":
        same(params.get("text"), expected["text"], f"{location}.text")
        targets = [integer_target(node.get("nextContentId", -1), location, count)]
        screen = {"text": params["text"]}
    elif expected["library"] == "H5P.BranchingQuestion 1.0":
        question = params.get("branchingQuestion")
        require(isinstance(question, dict), f"{location}: missing branchingQuestion wrapper")
        same(question.get("question"), expected["question"], f"{location}.question")
        require(not question.get("randomize", False), f"{location}: randomized choices are outside fixture contract")
        alternatives = question.get("alternatives")
        require(isinstance(alternatives, list), f"{location}: missing alternatives array")
        require(all(isinstance(a, dict) for a in alternatives), f"{location}: malformed alternative")
        choices = [a.get("text") for a in alternatives]
        same(choices, expected["choices"], f"{location}.choices")
        targets = []
        for j, alternative in enumerate(alternatives):
            at = f"{location}.alternatives[{j}]"
            targets.append(integer_target(alternative.get("nextContentId", -1), at, count))
            assert_no_feedback(alternative.get("feedback"), at + ".feedback")
        screen = {"question": question["question"], "choices": choices}
    elif expected["library"] == "H5P.Image 1.1":
        same(params.get("alt"), expected["alt"], f"{location}.alt")
        require(not params.get("decorative", False), f"{location}: image unexpectedly decorative")
        require(not params.get("title"), f"{location}: unexpected image hover text")
        file = params.get("file")
        require(isinstance(file, dict), f"{location}.file: missing typed image")
        relative = safe_path(file.get("path"), f"{location}.file.path")
        path = "content/" + relative
        require(path in entries, f"{location}: missing image bytes at {path}")
        require(file.get("mime") == "image/png", f"{location}: expected image/png")
        require(entries[path].startswith(b"\x89PNG\r\n\x1a\n"), f"{location}: expected PNG bytes")
        image_id = expected["image"]
        pin = manifest["images"][image_id]
        sha256 = pin.get("sha256")
        if not isinstance(sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", sha256):
            raise UnpinnedFixture(f"Original {image_id} image SHA-256 has not been frozen")
        actual_hash = hashlib.sha256(entries[path]).hexdigest()
        same(actual_hash, sha256, f"{location}.image_sha256")
        if case.get("require_source_collision_path"):
            same(path, pin["source_archive_path"], f"{location}.source_collision_path")
        image_record = {"node": index, "fixture_image": image_id, "archive_path": path, "sha256": actual_hash}
        targets = [integer_target(node.get("nextContentId", -1), location, count)]
        screen = {"alt": params["alt"], "image_sha256": actual_hash}
    else:
        raise OracleError(f"Unexpected expected library: {expected['library']}")
    return targets, choices, image_record, screen


def enumerate_traces(targets, choices, entry=0):
    """DFS directly over actual JSON targets. No product traversal is imported."""
    traces = []
    sequences = []
    terminal_ids = []

    def visit(node_id, path, labels):
        require(node_id not in path, f"Cycle encountered at {node_id}: {path}")
        current = path + [node_id]
        for alternative, target in enumerate(targets[node_id]):
            current_labels = labels + ([choices[node_id][alternative]] if choices[node_id] else [])
            if target < 0:
                traces.append(current)
                sequences.append(current_labels)
                terminal_ids.append(target)
            else:
                visit(target, current, current_labels)

    visit(entry, [], [])
    return traces, sequences, terminal_ids


def verify_entries(entries, manifest, case_name, native_edit=False):
    require(case_name in manifest["cases"], f"Unknown case {case_name!r}")
    case = manifest["cases"][case_name]
    overrides = {}
    if native_edit:
        variant = manifest["native_edit"]
        require(case_name in variant["allowed_cases"], "--native-edit is only valid for first_splice and shared_c")
        overrides = variant["node_content_overrides"]
    require("h5p.json" in entries, "Missing h5p.json")
    require("content/content.json" in entries, "Missing content/content.json")
    package = parse_json(entries["h5p.json"], "h5p.json")
    same(package.get("mainLibrary"), manifest["profile"]["main_library"], "h5p.json.mainLibrary")
    dependencies = package.get("preloadedDependencies", [])
    require(isinstance(dependencies, list), "h5p.json.preloadedDependencies must be a list")
    main_deps = [d for d in dependencies if isinstance(d, dict) and d.get("machineName") == package["mainLibrary"]]
    require(len(main_deps) == 1, "Require exactly one main library dependency")
    same(main_deps[0].get("majorVersion"), manifest["profile"]["major_version"], "main dependency majorVersion")
    same(main_deps[0].get("minorVersion"), manifest["profile"]["minor_version"], "main dependency minorVersion")
    content = parse_json(entries["content/content.json"], "content/content.json")
    scenario = content.get("branchingScenario")
    require(isinstance(scenario, dict), "Missing branchingScenario wrapper")
    nodes = scenario.get("content")
    require(isinstance(nodes, list), "Missing scenario.content array")
    same(len(nodes), len(case["nodes"]), "Node count (including no cloned shared C)")
    behaviour = scenario.get("behaviour", {})
    require(isinstance(behaviour, dict), "Malformed behaviour")
    for flag, expected_flag in manifest["profile"]["root_behaviour"].items():
        actual_flag = behaviour.get(flag, False)
        require(type(actual_flag) is bool and actual_flag is expected_flag,
                f"Root behaviour.{flag}: expected false; got {actual_flag!r}")
    scoring = scenario.get("scoringOptionGroup", {})
    require(isinstance(scoring, dict), "Malformed scoring options")
    same(scoring.get("scoringOption", "no-score"), "no-score", "scoringOption")
    endings = scenario.get("endScreens")
    require(isinstance(endings, list) and len(endings) == 1, "Require one default end screen")
    ending = endings[0]
    require(isinstance(ending, dict), "Malformed end screen")
    same(ending.get("contentId"), -1, "Default end screen ID")
    same(ending.get("endScreenTitle"), manifest["ending"]["title"], "Ending title")
    same(ending.get("endScreenSubtitle"), manifest["ending"]["subtitle"], "Ending subtitle")
    require(not ending.get("endScreenImage"), "Unexpected end-screen image")
    targets, choices, image_records, screens = [], [], [], []
    for i, identity in enumerate(case["nodes"]):
        expected = {**manifest["node_content"][identity], **overrides.get(identity, {})}
        actual_targets, actual_choices, image_record, screen = read_node(nodes[i], i, expected, len(nodes), entries, manifest, case)
        same(actual_targets, case["targets"][i], f"node[{i}] targets")
        targets.append(actual_targets)
        choices.append(actual_choices)
        screens.append({"index": i, "fixture_node": identity, **screen})
        if image_record:
            image_records.append(image_record)
    if len(image_records) > 1:
        require(len({image["archive_path"] for image in image_records}) == len(image_records), "Distinct collision images alias the same output path")
        require(len({image["sha256"] for image in image_records}) == len(image_records), "Distinct collision images unexpectedly have identical bytes")
    traces, sequences, terminal_ids = enumerate_traces(targets, choices, case["entry"])
    same(traces, case["traces"], "Complete trace set/order")
    same(sequences, case["choice_sequences"], "Choice sequences")
    same(terminal_ids, [-1] * len(traces), "Trace ending IDs")
    require(set(n for trace in traces for n in trace) == set(range(len(nodes))), "Unreachable node in bounded fixture")
    return {"status": "PASS", "case": case_name, "variant": "native_edit" if native_edit else "original", "node_count": len(nodes), "trace_count": len(traces),
            "traces": traces, "choice_sequences": sequences, "ending": manifest["ending"],
            "screens": screens, "images": image_records,
            "scope": "Independent static ZIP/JSON and image-byte assertions only",
            "native_editor_player_status": "NOT_RUN_BY_THIS_ORACLE"}


def verify_archive(path, manifest=None, case_name="first_splice", native_edit=False):
    manifest = manifest or load_manifest()
    result = verify_entries(archive_entries(path), manifest, case_name, native_edit=native_edit)
    result["archive"] = str(Path(path).resolve())
    result["archive_sha256"] = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    result["expected_manifest_sha256"] = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--case", choices=["module_a", "module_b", "module_c", "first_splice", "shared_c"], required=True)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--native-edit", action="store_true", help="Assert the frozen native-editor A0 edit; merged cases only")
    args = parser.parse_args()
    if args.native_edit and args.case not in ("first_splice", "shared_c"):
        parser.error("--native-edit is only valid for first_splice and shared_c")
    try:
        result = verify_archive(args.archive, load_manifest(args.manifest), args.case, native_edit=args.native_edit)
        exit_code = 0
    except UnpinnedFixture as error:
        result = {"status": "BLOCKED", "case": args.case, "variant": "native_edit" if args.native_edit else "original", "reason": str(error), "native_editor_player_status": "NOT_RUN_BY_THIS_ORACLE"}
        exit_code = 2
    except (OracleError, KeyError, OSError, TypeError) as error:
        result = {"status": "FAIL", "case": args.case, "variant": "native_edit" if args.native_edit else "original", "reason": str(error), "native_editor_player_status": "NOT_RUN_BY_THIS_ORACLE"}
        exit_code = 1
    text = json.dumps(result, indent=2, ensure_ascii=False)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text + "\n", encoding="utf-8")
    print(text)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
