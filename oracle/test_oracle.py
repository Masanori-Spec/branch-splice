"""Oracle self-tests only. Synthetic packages are NOT native-editor fixtures.

They exercise the checker itself. Passing these tests never claims BranchSplice,
H5P editor import/export, or H5P playback has passed.
"""
import copy
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile
import zlib

from verify_package import OracleError, UnpinnedFixture, load_manifest, verify_entries, verify_archive


def tiny_png(rgb):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\0" + bytes(rgb))) + chunk(b"IEND", b"")


def synthetic_package(case_name="first_splice", native_edit=False):
    manifest = copy.deepcopy(load_manifest())
    red, blue = tiny_png((255, 0, 0)), tiny_png((0, 0, 255))
    manifest["images"]["registration"]["sha256"] = hashlib.sha256(red).hexdigest()
    manifest["images"]["room"]["sha256"] = hashlib.sha256(blue).hexdigest()
    case = manifest["cases"][case_name]
    nodes, files = [], {}
    for identity, targets in zip(case["nodes"], case["targets"]):
        expectation = dict(manifest["node_content"][identity])
        if native_edit:
            expectation.update(manifest["native_edit"]["node_content_overrides"].get(identity, {}))
        params = {}
        node = {"type": {"library": expectation["library"], "params": params}, "showContentTitle": False}
        if "text" in expectation:
            params["text"] = expectation["text"]
            node["nextContentId"] = targets[0]
        elif "question" in expectation:
            params["branchingQuestion"] = {"question": expectation["question"], "alternatives": [
                {"text": choice, "nextContentId": target} for choice, target in zip(expectation["choices"], targets)]}
        else:
            source_case = case_name in ("module_b", "module_c")
            relative = "images/map.png" if source_case else f"images/{expectation['image']}/map.png"
            params.update({"file": {"path": relative, "mime": "image/png"}, "alt": expectation["alt"]})
            files["content/" + relative] = red if expectation["image"] == "registration" else blue
            node["nextContentId"] = targets[0]
        nodes.append(node)
    content = {"branchingScenario": {"content": nodes, "behaviour": {"randomizeBranchingQuestions": False},
        "endScreens": [{"contentId": -1, "endScreenTitle": manifest["ending"]["title"], "endScreenSubtitle": manifest["ending"]["subtitle"]}]}}
    metadata = {"mainLibrary": "H5P.BranchingScenario", "preloadedDependencies": [{"machineName": "H5P.BranchingScenario", "majorVersion": 1, "minorVersion": 8}]}
    entries = {"h5p.json": json.dumps(metadata).encode(), "content/content.json": json.dumps(content).encode(), **files}
    return manifest, entries, content


class OracleTests(unittest.TestCase):
    def setUp(self):
        self.manifest, self.entries, self.content = synthetic_package()
        self.nodes = self.content["branchingScenario"]["content"]

    def verify(self):
        self.entries["content/content.json"] = json.dumps(self.content).encode()
        return verify_entries(self.entries, self.manifest, "first_splice")

    def test_all_five_synthetic_cases(self):
        for case in ("module_a", "module_b", "module_c", "first_splice", "shared_c"):
            with self.subTest(case=case):
                manifest, entries, _ = synthetic_package(case)
                result = verify_entries(entries, manifest, case)
                self.assertEqual(result["status"], "PASS")
                self.assertEqual(result["native_editor_player_status"], "NOT_RUN_BY_THIS_ORACLE")
                self.assertEqual(result["trace_count"], 6 if case == "shared_c" else 4 if case == "first_splice" else 2)

    def test_deliberate_in_bounds_graph_corruption(self):
        self.nodes[2]["nextContentId"] = 8
        with self.assertRaisesRegex(OracleError, r"node\[2\] targets"):
            self.verify()

    def test_deliberate_collision_image_substitution(self):
        self.entries["content/images/registration/map.png"] = self.entries["content/images/room/map.png"]
        with self.assertRaisesRegex(OracleError, "image_sha256"):
            self.verify()

    def test_deliberate_collision_image_alias(self):
        self.nodes[8]["type"]["params"]["file"]["path"] = "images/registration/map.png"
        with self.assertRaisesRegex(OracleError, "image_sha256"):
            self.verify()

    def test_literal_asset_looking_text_must_not_be_rewritten(self):
        self.nodes[0]["type"]["params"]["text"] = self.nodes[0]["type"]["params"]["text"].replace("images/map.png", "images/registration/map.png")
        with self.assertRaisesRegex(OracleError, r"node\[0\].text"):
            self.verify()

    def test_shared_c_is_not_cloned(self):
        self.content["branchingScenario"]["content"].extend(copy.deepcopy(self.nodes[8:12]))
        with self.assertRaisesRegex(OracleError, "Node count"):
            self.verify()

    def test_alternative_target_corruption(self):
        self.nodes[1]["type"]["params"]["branchingQuestion"]["alternatives"][0]["nextContentId"] = 3
        with self.assertRaisesRegex(OracleError, r"node\[1\] targets"):
            self.verify()

    def test_alternative_text_corruption(self):
        self.nodes[5]["type"]["params"]["branchingQuestion"]["alternatives"][0]["text"] = "WRONG"
        with self.assertRaisesRegex(OracleError, "choices"):
            self.verify()

    def test_question_text_corruption(self):
        self.nodes[5]["type"]["params"]["branchingQuestion"]["question"] = "WRONG"
        with self.assertRaisesRegex(OracleError, "question"):
            self.verify()

    def test_ending_text_corruption(self):
        self.content["branchingScenario"]["endScreens"][0]["endScreenSubtitle"] = "Wrong ending"
        with self.assertRaisesRegex(OracleError, "Ending subtitle"):
            self.verify()

    def test_unwrapped_ending_title_rejected_under_revised_contract(self):
        self.content["branchingScenario"]["endScreens"][0]["endScreenTitle"] = "Branch complete"
        with self.assertRaisesRegex(OracleError, "Ending title"):
            self.verify()

    def test_custom_feedback_rejected(self):
        self.nodes[6]["feedback"] = {"title": "Alternate ending"}
        with self.assertRaisesRegex(OracleError, "custom feedback"):
            self.verify()

    def test_zero_feedback_score_is_not_default_ending(self):
        self.nodes[6]["feedback"] = {"endScreenScore": 0}
        with self.assertRaisesRegex(OracleError, "triggers a custom ending"):
            self.verify()

    def test_image_alt_corruption(self):
        self.nodes[8]["type"]["params"]["alt"] = "Registration map"
        with self.assertRaisesRegex(OracleError, r"node\[8\].alt"):
            self.verify()

    def test_missing_image_bytes(self):
        del self.entries["content/images/registration/map.png"]
        with self.assertRaisesRegex(OracleError, "missing image bytes"):
            self.verify()

    def test_unpinned_images_are_blocked(self):
        self.manifest["images"]["registration"]["sha256"] = None
        with self.assertRaises(UnpinnedFixture):
            self.verify()

    def test_out_of_range_target(self):
        self.nodes[2]["nextContentId"] = 99
        with self.assertRaisesRegex(OracleError, "invalid target"):
            self.verify()

    def test_boolean_is_not_a_target(self):
        self.nodes[2]["nextContentId"] = True
        with self.assertRaisesRegex(OracleError, "must be an integer"):
            self.verify()

    def test_positive_target_not_silently_treated_as_ending(self):
        self.nodes[6]["nextContentId"] = 12
        with self.assertRaisesRegex(OracleError, "invalid target"):
            self.verify()

    def test_randomization_rejected(self):
        self.content["branchingScenario"]["behaviour"]["randomizeBranchingQuestions"] = True
        with self.assertRaisesRegex(OracleError, "randomizeBranchingQuestions"):
            self.verify()

    def test_backwards_navigation_rejected(self):
        self.content["branchingScenario"]["behaviour"]["enableBackwardsNavigation"] = True
        with self.assertRaisesRegex(OracleError, "enableBackwardsNavigation"):
            self.verify()

    def test_force_finished_rejected(self):
        self.content["branchingScenario"]["behaviour"]["forceContentFinished"] = True
        with self.assertRaisesRegex(OracleError, "forceContentFinished"):
            self.verify()

    def test_root_flag_nonboolean_rejected(self):
        for value in (0, "false", None):
            with self.subTest(value=value):
                self.content["branchingScenario"]["behaviour"]["enableBackwardsNavigation"] = value
                with self.assertRaisesRegex(OracleError, "enableBackwardsNavigation"):
                    self.verify()

    def test_native_edit_variant_passes_both_merged_cases(self):
        for case in ("first_splice", "shared_c"):
            with self.subTest(case=case):
                manifest, entries, _ = synthetic_package(case, native_edit=True)
                result = verify_entries(entries, manifest, case, native_edit=True)
                self.assertEqual(result["variant"], "native_edit")
                self.assertEqual(result["traces"], manifest["cases"][case]["traces"])
                self.assertEqual(result["screens"][0]["text"], "<p>Welcome to BranchSplice. Edited in the native editor.</p><p>Literal asset-looking text: images/map.png</p>")
                self.assertEqual(result["native_editor_player_status"], "NOT_RUN_BY_THIS_ORACLE")

    def test_native_edit_variant_rejects_original_text(self):
        with self.assertRaisesRegex(OracleError, r"node\[0\].text"):
            verify_entries(self.entries, self.manifest, "first_splice", native_edit=True)

    def test_original_variant_rejects_native_edit_text(self):
        manifest, entries, _ = synthetic_package(native_edit=True)
        with self.assertRaisesRegex(OracleError, r"node\[0\].text"):
            verify_entries(entries, manifest, "first_splice")

    def test_native_edit_rejects_changes_to_other_nodes(self):
        manifest, entries, content = synthetic_package(native_edit=True)
        content["branchingScenario"]["content"][2]["type"]["params"]["text"] = "<p>Changed another node.</p>"
        entries["content/content.json"] = json.dumps(content).encode()
        with self.assertRaisesRegex(OracleError, r"node\[2\].text"):
            verify_entries(entries, manifest, "first_splice", native_edit=True)

    def test_native_edit_has_no_html_normalization(self):
        manifest, entries, content = synthetic_package(native_edit=True)
        text = content["branchingScenario"]["content"][0]["type"]["params"]["text"]
        content["branchingScenario"]["content"][0]["type"]["params"]["text"] = text.replace("</p><p>", "</p>\n<p>")
        entries["content/content.json"] = json.dumps(content).encode()
        with self.assertRaisesRegex(OracleError, r"node\[0\].text"):
            verify_entries(entries, manifest, "first_splice", native_edit=True)

    def test_native_edit_not_allowed_for_modules(self):
        for case in ("module_a", "module_b", "module_c"):
            manifest, entries, _ = synthetic_package(case)
            with self.subTest(case=case), self.assertRaisesRegex(OracleError, "only valid"):
                verify_entries(entries, manifest, case, native_edit=True)

    def test_native_edit_cli_rejects_module_case_before_reading(self):
        import subprocess
        import sys
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("verify_package.py")), "nonexistent.h5p", "--case", "module_a", "--native-edit"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("only valid for first_splice and shared_c", result.stderr)

    def test_merged_image_paths_may_change_if_bytes_and_aliases_preserved(self):
        for index, old, new in ((4, "content/images/registration/map.png", "content/images/map-reg_a1b2.png"), (8, "content/images/room/map.png", "content/images/map-room_c3d4.png")):
            self.entries[new] = self.entries.pop(old)
            self.nodes[index]["type"]["params"]["file"]["path"] = new.removeprefix("content/")
        self.assertEqual(self.verify()["status"], "PASS")

    def test_source_module_still_requires_collision_path(self):
        manifest, entries, content = synthetic_package("module_b")
        entries["content/images/map-random.png"] = entries.pop("content/images/map.png")
        content["branchingScenario"]["content"][0]["type"]["params"]["file"]["path"] = "images/map-random.png"
        entries["content/content.json"] = json.dumps(content).encode()
        with self.assertRaisesRegex(OracleError, "source_collision_path"):
            verify_entries(entries, manifest, "module_b")

    def test_external_image_rejected(self):
        self.nodes[4]["type"]["params"]["file"]["path"] = "https://example.com/map.png"
        with self.assertRaisesRegex(OracleError, "unsafe or remote"):
            self.verify()

    def test_path_traversal_rejected(self):
        self.nodes[4]["type"]["params"]["file"]["path"] = "../images/map.png"
        with self.assertRaisesRegex(OracleError, "non-canonical"):
            self.verify()

    def test_missing_wrapper_rejected(self):
        self.content = self.content["branchingScenario"]
        with self.assertRaisesRegex(OracleError, "wrapper"):
            self.verify()

    def test_duplicate_json_keys_rejected(self):
        self.entries["h5p.json"] = b'{"mainLibrary":"H5P.BranchingScenario","mainLibrary":"Fake"}'
        with self.assertRaisesRegex(OracleError, "Duplicate JSON key"):
            self.verify()

    def test_actual_zip_reader(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-selftest-only.h5p"
            with zipfile.ZipFile(path, "w") as archive:
                for name, data in self.entries.items():
                    archive.writestr(name, data)
            self.assertEqual(verify_archive(path, self.manifest)["trace_count"], 4)

    def test_real_archive_mutation_runner_on_synthetic_baselines(self):
        from mutation_checks import run_mutations
        for case, native_edit in (("first_splice", False), ("shared_c", False), ("first_splice", True), ("shared_c", True)):
            with self.subTest(case=case, native_edit=native_edit), tempfile.TemporaryDirectory() as directory:
                manifest, entries, _ = synthetic_package(case, native_edit=native_edit)
                path = Path(directory) / "synthetic-selftest-only.h5p"
                with zipfile.ZipFile(path, "w") as archive:
                    for name, data in entries.items():
                        archive.writestr(name, data)
                result = run_mutations(path, case, manifest, native_edit=native_edit)
                self.assertEqual(result["status"], "PASS")
                self.assertEqual(len(result["negative_controls"]), 2)
                self.assertTrue(all(c["status"] == "CORRECTLY_REJECTED" for c in result["negative_controls"]))

    def test_duplicate_zip_entries_rejected(self):
        import warnings
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-selftest-only.h5p"
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(path, "w") as archive:
                    for name, data in self.entries.items():
                        archive.writestr(name, data)
                    archive.writestr("content/content.json", self.entries["content/content.json"])
            with self.assertRaisesRegex(OracleError, "Duplicate ZIP entry"):
                verify_archive(path, self.manifest)


if __name__ == "__main__":
    unittest.main(verbosity=2)
