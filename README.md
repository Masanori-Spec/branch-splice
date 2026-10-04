# BranchSplice

Connect independently authored H5P Branching Scenario modules without rebuilding their internal branches. Inspect every resulting route and image mapping, then download one editable H5P plus a JSON provenance manifest and readable connection report.

**Application candidate: merged-output browser/native acceptance is still pending.** The genuine upstream-editor single-node and three-module fixture gates passed in [run37239898535](https://github.com/Masanori-Spec/branch-splice/actions/runs/37239898535). The archive/merger suite passes 66 tests (including 34 merger tests); its two 12-node CLI outputs pass the independently frozen 4-route/6-route oracle and corrupted-route/media negative controls. These static results do not substitute for actual application downloads and native edit/replay.

## Try locally

```sh
npm ci --ignore-scripts
npm run build
```

Open `dist/index.html` directly in desktop Chrome. The hosted acceptance target is sandboxed Chrome on Ubuntu22.04; other browsers are unverified. Processing uses a cancellable Web Worker. Choose **2–5 of your own supported `.h5p` files together**, connect their empty-feedback endings, then inspect routes and download the merged H5P, JSON manifest and text report. The interface is Japanese/English; changing language does not rewrite source content.

No H5P sample or upstream content-library software is bundled with the public app. The app works offline with your local files; it does not fetch missing libraries. All input packages must contain the exact supported dependency files. `npm run serve` starts an optional loopback-only preview. A new file selection replaces the current workspace; changes invalidate previous exports, and closing the page discards work.

### Reproduce the synthetic test locally

```sh
npm run native:setup
npm run fixture:prepare
```

Setup acquires hash-pinned packages directly from the official sources for local verification. The reconstruction recipe combines their exact entry bytes with the public, native-authored JSON and synthetic PNGs. It checks the complete file-entry digest against the originally accepted native exports before writing private `fixtures/h5p/module-A.h5p`, B and C. ZIP headers and archive hashes change, but authored content and every library entry remain exact. Select those three local files in the app. Connect A2→B0 and A3→C0 for four routes; additionally connect B2→C0 and B3→C0 for six. C is shared once, so both outputs have 12 nodes.

The repository and public CI artifacts do not redistribute these reconstructed H5Ps, native libraries, traces or HTML snapshots. CI keeps them only on its ephemeral runner to verify real downloads and native consumption; public evidence contains screenshots and factual hashes/reports.

## Exact supported profile

- Lumi Node.js 10.0.4 / Core 1.27; Branching Scenario 1.8.14
- Branching Question 1.0.20, Advanced Text 1.1.14, Image 1.1.22
- 2–5 modules, at most 60 total nodes and 512 complete forward choice routes; 2 MiB per JSON entry and an 8 MiB combined receipt budget
- Acyclic, fully reachable, no scoring, backwards navigation, randomization or forced completion
- Identical shared default endings, localization and behavior; compatible package rights metadata; donor start screens empty; host start screen retained
- Only empty-feedback terminal exits may be connected. Other feedback remains intact
- Exact pinned official dependency files. Unsupported versions, modified library bytes, missing dependencies, unsafe archive entries and unsupported active HTML are rejected
- Typed static PNG/JPEG/GIF/WebP image references; image bytes and metadata retained. Animated formats, SVG, untyped/remote media and unused content files are rejected

This is deliberately conservative. It does not upgrade libraries or guarantee Lumi Desktop, Core 1.28, arbitrary LMS, or all H5P authoring environments. Raster checking verifies static structure, signatures and dimensions, not full codec decoding. Browser sample tests separately verify that both synthetic PNGs decode.

Different images at the same path are renamed and only typed image fields change. Literal prose such as `images/map.png` is untouched. Host subContentIds stay; donor IDs are regenerated with old→new mappings. Multiple incoming connections share one copy of a donor.

## Verification

```sh
npm run native:setup
npm run fixture:prepare
npm test
npm run test:oracle
npm run build
npm run fixture
npm run test:native-server
CHROME_BIN=/usr/bin/google-chrome node tests/browser-test.mjs
CHROME_BIN=/usr/bin/google-chrome node native/consume-merged.mjs
```

Native browser tests require sandbox-capable Chrome on Ubuntu22.04. They must not be run with `--no-sandbox`. The native harness is disposable, loopback-only and limited to synthetic fixtures; it is not a production hosting service. See [its security boundary](docs/native-security.md), [fixture methodology](docs/native-fixture-method.md), [independent oracle](oracle/README.md), and [research/differences](docs/research-and-boundary.md).

The frozen expectations were handwritten before the merger: exact screen HTML, choice labels, ending, image hashes, node targets and complete route traces. The separate Python reader never imports product code. The hosted product gate must consume actual UI downloads, edit A0 in the upstream editor, save/export again, and replay all four plus six complete routes and images. Each output's manifest truthfully distinguishes static validation from individual live native playback.

## Architecture and rights

`src/` contains strict data-only archive validation and composition. `web/` runs it in a cancellable Worker with plain-text previews; package JavaScript is never executed by the composer. `native/` is the separate official-consumer harness. `oracle/` supplies independent expectations. `fixtures/` publishes only synthetic adult event-staff orientation JSON, map images and provenance. No learner records are collected or created. Unknown record-like fields are rejected by the bounded schema; it cannot determine whether a person has written private information inside legitimate prose or author fields.

The historical workflow difference is whole-module route preservation with explicitly reviewed exits, rather than individual content copying. Demand and commercial adoption remain unvalidated; no world-first claim is made. Upstream dependencies retain their own notices and licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
