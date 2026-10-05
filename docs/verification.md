# Verified prototype: acceptance record

Accepted code: [3de793291fb06677edb276388ffab7dbcf0011b6](https://github.com/Masanori-Spec/branch-splice/commit/3de793291fb06677edb276388ffab7dbcf0011b6)

- [Full product run 37246548803](https://github.com/Masanori-Spec/branch-splice/actions/runs/37246548803): Node 22/24 static jobs and browser/native job passed
- [Native authoring run 37246548791](https://github.com/Masanori-Spec/branch-splice/actions/runs/37246548791): genuine upstream single-node and A/B/C fixture creation, reimport and playback passed
- Reviewed 2026-10-05. Later completion-documentation commits do not change the accepted app or engine bytes
- Standalone app: 661162 bytes, SHA-256 `aabd6290b4773f8f4be9eb76d568a362c9d94408f4a6911dda0be29e322c388f`

Machine-readable detail: [verification.json](verification.json)

![A0 edited in the genuine native H5P editor](screenshots/native-edit.png)

## What passed

67 product tests cover archive bounds, known native HTML/metadata sinks, library bytes, graph and media remapping, fresh donor IDs, receipt limits and generated HTML. 70 independent Python tests cover the semantic and provenance checkers. 8 local native-server boundary checks also pass.

The actual standalone app was exercised in sandboxed Chrome 154.0.8037.57 on Ubuntu 22.04. Its 17 browser checks include real Worker file loads, actual H5P/JSON/text downloads, four and six routes, both decoded images, Japanese/English, keyboard tabs, 390px layout, error recovery, stale-export invalidation, cycles, unreachable modules, changed host, reset during loading, repeated inputs and offline `file://` use. No page errors, console errors or external requests were recorded.

The native gate used those exact browser downloads. Each was imported through the native upload form, inspected as a 12-node graph, edited only at A0 through the native rich-text field, saved and downloaded through its actual Download link. Every one of the four first-case and six shared-C routes then passed visible text/choice/ending checks, retained host-opening checks, stable in-viewport screenshots and loaded-image byte hashes. Shared C remains one four-node module. Native page/HTTP/external-response error lists are empty. Optional remote Help was blocked by CSP as intended.

All ten route contact sheets, imported graphs, A0 edits and application views were visually reviewed. Full-field independent provenance checks pass 8,353/8,391 assertions, including 2,532 unchanged library/resource files. Independent graph-offset and wrong-collision-image corruptions fail for the intended reasons.

## Actual output evidence without redistributing H5P software

The public workflow uploads safe screenshots, authored JSON, hashes and reports only. It excludes native packages, library bytes, traces and HTML snapshots. The sanitized reports record the actual archive SHA-256 and all file-entry hashes, and contain only our authored content/metadata JSON.

For independent review, both actual UI ZIPs were reconstructed **hash-for-hash** using that evidence and locally acquired official libraries. The native edited packages were reconstructed with **all 2,536 entries exact**; their ZIP container encoding differs, so their reconstructed container hashes are not claimed to equal the actual native downloads. Both post-edit reconstructions passed the frozen native-edit oracle.

Use `scripts/reconstruct-evidence.mjs` with a sanitized report after `npm run native:setup` to repeat this private reconstruction. It fails unless every entry matches. The reports do not grant redistribution rights for upstream packages.

## Scope and maintenance

The verified consumer is Lumi Node.js 10.0.4 / Core 1.27 / BranchingScenario 1.8.14, with exact official dependencies listed in `native/profile.json`. The public app contains no H5P sample/library software and requires users' own matching packages. Test fixtures can be reconstructed locally from authored JSON/PNGs and official downloads.

This is synthetic acceptance, not a production deployment or universal H5P/LMS/Desktop/browser compatibility result. There are no learner records or scoring features. Metadata shape checks cannot classify private information inside legitimate prose. Raster validation is structural, not a full codec-security guarantee. The native harness remains disposable and loopback-only with documented npm advisories; it must not become an arbitrary public upload service.

Observed three-file load times were about 20–21 seconds and composition about 1.7–1.8 seconds on the CI runner. These are observations, not performance guarantees. Commercial demand and willingness to pay remain unvalidated.

GitHub's v4 checkout/setup-node/upload-artifact actions report deprecated Node 20 runtime declarations and are currently forced to Node 24 by GitHub. The accepted runs succeeded; updating action versions is a future maintenance task, not an untested change in this release.
