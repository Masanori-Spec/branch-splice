# BranchSplice — feasibility in progress

A bounded experiment to combine independently authored H5P Branching Scenario modules into one editable package, preserving internal routes and media.

**Not a finished product. The native gate and acceptance tests are not yet complete.** No merger or product interface is implemented yet.

The first gate uses published `@lumieducation/h5p-server@10.0.4` and its official Core1.27/editor commits, together with the official H5P Hub BranchingScenario1.8.14 package. All bytes are checked against pinned SHA-256 hashes. No version metadata is changed. This is not a claim of Lumi Desktop or current Core1.28 compatibility.

```
npm ci --ignore-scripts
npm run native:setup
npm run test:native
```

The browser test uses sandboxed Chrome on Ubuntu22.04. The native server is a local-only verification harness adapted from the official Lumi example. Do not expose it to a network. It has one synthetic author, no authentication, no learner data storage and no external accounts. The upstream libraries are kept intact, including dependencies required by the native editor. Final product content will be limited to text, image and branching-question nodes.

Native dependency licensing: Lumi H5P Node.js GPL-3.0-or-later; upstream H5P core/editor and content libraries retain their own licenses. Dependencies are downloaded from official sources for local verification and are not relicensed here.
