# BranchSplice independent oracle

This directory contains handwritten expected outcomes and a separate Python
standard-library ZIP/JSON reader. It imports **no product code**. The content and
graph contract was agreed and written before the product merge engine existed.
The source image pins were independently hashed from original fixture PNGs.

## What this proves

For a supplied archive, the checker verifies:

- The main library is H5P.BranchingScenario 1.8 and content uses its real wrapper
- Exact node count, order, child library versions, node text HTML, question HTML,
  choice labels and ordering, image alternative text, and default ending text
- Each actual graph target and all complete choice-labelled traces
- Four traces for `first_splice`; six for `shared_c`, with exactly 12 nodes and
  the same four C nodes reused by all three incoming links
- Exact SHA-256 at each **typed image field**, resolving its referenced ZIP bytes
- Different B/C images survive their colliding original `content/images/map.png`
  paths, and merged image references do not alias
- Literal `images/map.png` in A0's text remains unchanged
- No surprise visible feedback, feedback score overriding the default ending,
  enabled root backward navigation, root forced-content completion, randomized
  questions, cloned nodes, unreachable nodes, or out-of-range targets
- No duplicate JSON keys, duplicate ZIP entries, unsafe paths, remote image
  URLs, or encrypted archives

Paths in merged output may change; the oracle verifies bytes at typed references,
not an implementation-specific renaming scheme. Source `module_b` and `module_c`
cases require the intended original collision path. Native upload filename
normalization must be documented separately if preparing those source archives.

This is a **bounded static fixture oracle**, not a general H5P validator and not
proof of native editor compatibility, browser screen rendering, or deployment.
Native editor/player tests must supply independent evidence. The oracle explicitly
reports `native_editor_player_status: NOT_RUN_BY_THIS_ORACLE` even on static PASS.

## Files

- `expected-manifest.json`: handwritten screens, choices, edges, complete traces,
  and independently frozen source PNG hashes
- `contract-freeze.json`: full manifest file hash and pre-engine provenance
- `contract-revisions.json`: explicitly reviewed pre-implementation revision history;
  revision 1 changes only ending title to `<p>Branch complete</p>` because the
  exact native semantics specify an HTML widget with paragraph enter mode;
  revision 2 freezes the native-edit variant and all root behaviour flags false
- `verify_package.py`: independent archive checker, no JS or product imports
- `mutation_checks.py`: real-artifact corruption controls; writes temporary
  copies only, never changes the source archive
- `test_oracle.py`: checker-only tests, with **synthetic** packages built only to
  exercise the oracle; they do not stand in for native-editor-authored fixtures
- `verification-status.json`: truthful stage status when this oracle was delivered
- `selftest-output.txt`: self-test execution transcript
- `upstream-semantics-notes.md`: upstream interpretation and precise profile notes

## Commands

Run from the project root with Python 3 (no pip packages required):

```sh
python3 -m unittest discover -s oracle -p 'test_*.py' -v
python3 oracle/verify_package.py PATH_TO_A.h5p --case module_a --report oracle/reports/module-a.json
python3 oracle/verify_package.py PATH_TO_B.h5p --case module_b --report oracle/reports/module-b.json
python3 oracle/verify_package.py PATH_TO_C.h5p --case module_c --report oracle/reports/module-c.json
python3 oracle/verify_package.py PATH_TO_FIRST.h5p --case first_splice --report oracle/reports/first.json
python3 oracle/verify_package.py PATH_TO_SHARED_C.h5p --case shared_c --report oracle/reports/shared.json
python3 oracle/mutation_checks.py PATH_TO_FIRST.h5p --case first_splice --report oracle/reports/first-mutations.json
python3 oracle/mutation_checks.py PATH_TO_SHARED_C.h5p --case shared_c --report oracle/reports/shared-mutations.json
python3 oracle/verify_package.py PATH_TO_NATIVE_EDITED_FIRST.h5p --case first_splice --native-edit --report oracle/reports/first-edited.json
python3 oracle/verify_package.py PATH_TO_NATIVE_EDITED_SHARED_C.h5p --case shared_c --native-edit --report oracle/reports/shared-edited.json
python3 oracle/mutation_checks.py PATH_TO_NATIVE_EDITED_FIRST.h5p --case first_splice --native-edit --report oracle/reports/first-edited-mutations.json
python3 oracle/mutation_checks.py PATH_TO_NATIVE_EDITED_SHARED_C.h5p --case shared_c --native-edit --report oracle/reports/shared-edited-mutations.json
```

The `PATH_TO_*` names are placeholders, not claimed-existing artifacts. The CLI
returns 0 on static PASS, 1 on a failed supplied-archive check, and 2 when expected
image hashes are not pinned. Missing native/product artifacts are **NOT_RUN** in
the delivery status, not a pass or failure.

`mutation_checks.py` first requires the unmodified real artifact to pass. It then
changes A2's valid target from B0 (4) to C0 (8), and independently replaces B0's
referenced PNG bytes with C0's bytes. Both must fail for the intended reason. This
checks graph and collision-image false positives without relying on product
mutation helpers. The real-artifact negative controls remain NOT_RUN until real
product artifacts exist, even though their runner has synthetic self-tests.

Do not update the manifest to match an unexpected product result. Investigate
first. If native editor serialization changes insignificant HTML, record and
review that narrowly as a contract revision rather than silently weakening exact
screen assertions. Verify the contract hash before adopting a different manifest.

## Frozen native-edit variant

`--native-edit` is permitted only for `first_splice` and `shared_c`. It changes
exactly A0's expected raw HTML to:

```html
<p>Welcome to BranchSplice. Edited in the native editor.</p><p>Literal asset-looking text: images/map.png</p>
```

All other node content, edges, choice labels, ending text, image hashes and
distinct image references retain the original assertions. The original and
edited variants reject each other's A0 text. Even an inserted HTML newline is
rejected; this adds no HTML normalization. Reports identify the selected variant.

The root flags `enableBackwardsNavigation`, `forceContentFinished`, and
`randomizeBranchingQuestions` must be boolean false, or absent (their documented
default is false). Boolean true and non-boolean values fail.

Native reimport may rename an image path. Merged cases intentionally follow the
typed image reference and assert frozen bytes rather than filename spelling,
both before and after native editing. Original module_b/module_c donor checks
still require `content/images/map.png`. No hash or alias constraint was weakened.

## Sanitized public evidence

`sanitize_evidence.py` first applies this independent oracle to an actual downloaded package, then writes only our authored JSON entry bytes, the source archive SHA-256, and every file-entry size/hash. It never publishes library bytes. `scripts/reconstruct-evidence.mjs` can reconstruct an equivalent private ZIP locally from those JSON entries, the synthetic PNGs and official libraries already acquired by native:setup. Every entry hash must match; ZIP-container hashes may differ. Raw H5Ps, traces and HTML snapshots stay on the ephemeral verification runner. Public artifacts are explicit JSON/text summaries and screenshots only.
