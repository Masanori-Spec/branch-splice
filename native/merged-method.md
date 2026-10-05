# Native merged-package consumer gate

## Scope and prerequisites

This gate verifies the **actual two `.h5p` downloads produced through the BranchSplice browser UI**. It requires the official native setup and app browser gate to have completed in the same hosted CI workspace. The three-module native-authoring prerequisite is independent of this consumer gate.

The consumer defaults to:

- `artifacts/browser/first.h5p` → handwritten case `first_splice` (12 nodes, 4 routes)
- `artifacts/browser/shared.h5p` → handwritten case `shared_c` (12 nodes, 6 routes)

Missing files fail explicitly. There is no fallback to `generated/` or to a product CLI. An explicitly supplied input directory is reported as `explicit-debug-input-root` and is never described as a verified app download. Every input and native export records its full source path, byte count, and SHA-256.

## Hosted workflow invocation

Run on `ubuntu-22.04` with Node dependencies, Python 3, official native runtime libraries, and `/usr/bin/google-chrome` installed. Port 8080 must be free. The script starts and stops its own native server.

```yaml
- name: Consume actual app downloads in the native editor and replay all routes
  timeout-minutes: 15
  run: node native/consume-merged.mjs
  env:
    CHROME_BIN: /usr/bin/google-chrome
```

GitHub Actions supplies `GITHUB_ACTIONS=true` and `RUNNER_OS=Linux`. The gate fails before launching a browser outside that environment. It explicitly launches with `chromiumSandbox: true` and rejects `--no-sandbox` and `--disable-setuid-sandbox` in the recorded browser command. Do not bypass a local sandbox failure.

For a separately labeled debug input directory **on hosted CI**:

```sh
CHROME_BIN=/usr/bin/google-chrome node native/consume-merged.mjs --input-root artifacts/debug-input
```

Equivalent environment input: `NATIVE_MERGED_INPUT_ROOT`. Output can be changed using `--output-root` or `NATIVE_MERGED_OUTPUT_ROOT` (default `artifacts/native-merged`).

## What the gate actually does

For each downloaded package:

1. Reads the package and runs the independent Python archive oracle against the frozen handwritten manifest. This checks the 12-node graph, every target and complete trace, both distinct original image hashes, exact content, and end-screen contract. This static assertion is explicitly identified as static, not native execution.
2. Uses the native upload form and Import button. Inspects the actual 12-node native graph, uses native Zoom to fit, and captures the graph. Any native “I got it” tour is dismissed through its visible button.
3. Opens the displayed A0 text node, asserts its original rich text, and changes only this one native rich-text field to the manifest’s `native_edit` value. The only writable browser evaluation calls the selected native CKEditor’s public `setData` API. No content JSON, routing fields, native application state, graph state, or product helper is injected.
4. Closes the node editor, saves through the native Save control, and clicks the actual native renderer’s Download link. Saves the genuine browser download to `first-native-edited.h5p` or `shared-native-edited.h5p`.
5. Runs `oracle/verify_package.py ... --native-edit` on the downloaded native export. The oracle checks all unchanged graph and screen contracts and the one explicitly allowed A0 text edit.
6. Reopens the saved native player and performs all four or six complete routes through the visible Start, Proceed, and branching alternative controls. Asserts exact displayed question HTML and ordered choice labels, exact rendered AdvancedText HTML, both end-screen text fields, and actual displayed image URL, dimensions, size, and fetched image-byte SHA-256.
7. Records each verified screen and selected choice. A node index in the observed trace denotes the uniquely identified displayed content that passed its exact frozen screen check; navigation never uses that index or graph state.

AdvancedText inserts a runtime resize sensor. The gate clones its DOM and removes **only** direct `div.resize-triggers` children with exactly one direct expand-trigger and one direct contract-trigger. It does not mutate live DOM or normalize the archive. All other HTML stays exact. This is the only runtime HTML exception.

Every accepted screenshot target must have a positive bounding box wholly inside the viewport and stable within 0.25 px over three consecutive samples. The test does not accept offscreen transition frames. Failure captures are diagnostics, never passing evidence.

The native server applies same-origin CSP. Browser routing independently blocks all external requests, including optional remote help. Both attempted and blocked requests are retained. Any uncaught page error, HTTP status ≥400, or actual external response fails the gate. Console diagnostics and request failures are also retained for review.

## Output and upload groups

Do not upload the entire output directory as one artifact. Preserve these separate groups; `artifact-groups.json` lists exact paths and measured file sizes, and the gate fails if an individual group reaches 32 MiB.

| Artifact group | Paths relative to `artifacts/native-merged/` |
|---|---|
| `native-merged-exports` | `first-native-edited.h5p`, `shared-native-edited.h5p` (approximately 15 MiB together) |
| `native-merged-summary` | `report.json`, `first-report.json`, `shared-report.json`, `server.log`, `browser-command.json`, `artifact-groups.json` |
| `native-merged-first-input-checks` | `first/input-checks/` |
| `native-merged-shared-input-checks` | `shared/input-checks/` |
| `native-merged-first-import-edit` | `first/import-edit/` |
| `native-merged-shared-import-edit` | `shared/import-edit/` |
| `native-merged-first-route-01` through `-04` | **One artifact per** `first/route-01/` through `first/route-04/` |
| `native-merged-shared-route-01` through `-06` | **One artifact per** `shared/route-01/` through `shared/route-06/` |

Each import/edit directory contains a Playwright trace, stable graph and edit screenshots, DOM snapshots, and the `--native-edit` oracle report. Each route directory contains its own Playwright trace, one stable screenshot per displayed node plus ending, ending DOM, and route report. Input-check directories contain the strict original-variant oracle reports and logs. On failure, the current trace segment includes a screenshot and frame DOM where available.

Example upload for one route (repeat with each distinct directory/name):

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: native-merged-first-route-01
    path: artifacts/native-merged/first/route-01/
    if-no-files-found: warn
```

The complete hosted run passed at code commit `3de793291fb06677edb276388ffab7dbcf0011b6`: [run37246548803](https://github.com/Masanori-Spec/branch-splice/actions/runs/37246548803). All four first-case routes and six shared-C routes were then visually reviewed; exact native file entries were independently reconstructed from sanitized evidence and rechecked. This establishes the pinned synthetic acceptance cases only.

## Public evidence boundary

Generated H5Ps, traces and HTML snapshots are temporary local/runner diagnostics only. The public workflow deliberately uploads only selected JSON summaries and PNG screenshots. The artifact-groups report describes private generated material for size accounting; it does not authorize publication of those paths. The public app requires user-provided packages and does not embed upstream libraries.
