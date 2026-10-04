# BranchSplice research and feasibility boundary

This is an ordinary software workflow experiment: join independently authored H5P Branching Scenario modules by preserving each input's array-index routes, mapping selected empty-feedback exits to donor entries, and preserving typed media references. No new content runtime, assessment method, learner record system, or novelty claim is proposed.

## Evidence for the workflow

- [H5P discussion (2020)](https://h5p.org/node/693101): combining branches was requested
- [H5P discussion (2022)](https://h5p.org/node/1331867): independently authored scenarios were requested to be combined
- [H5P support (2024)](https://h5p.org/node/1493060): individual content upload/copy/paste placement remains a documented workaround
- [Official editor source](https://github.com/h5p/h5p-editor-branching-scenario/blob/1.5.7/src/scripts/components/Canvas.js): copy operates on one content node; a regular pasted node's nextContentId is reset to -1
- [Official Branching Scenario semantics](https://github.com/h5p/h5p-branching-scenario/blob/1.8.14/semantics.json): native fields describe content array entries, branch alternatives, feedback and global behavior; nested Branching Scenarios are not a supported node type
- [H5P package specification](https://h5p.org/documentation/developers/h5p-specification): packages are ZIP archives with content parameters, metadata, media and libraries

These are workflow and source-code observations, not proof that no competing product exists. Demand discussions are historical. Willingness to pay, organizational adoption, and compatibility beyond the stated profile are unvalidated. No patent assessment has been performed.

## Pinning the actual consumer

The released [Lumi Node.js10.0.4](https://github.com/Lumieducation/H5P-Nodejs-library/releases/tag/v10.0.4) implements Core1.27. The repository's later master branch is not evidence that the published npm release supports Core1.28. The [official install script](https://github.com/Lumieducation/H5P-Nodejs-library/blob/v10.0.4/scripts/install.sh) pins the core and editor commits used here.

The official H5P Hub bundle downloaded for this experiment contains BranchingScenario1.8.14, BranchingQuestion1.0.20, AdvancedText1.1.14, Image1.1.22 and BranchingScenario editor1.5.7. Its70 libraries declare no coreAPI requirement above1.27, but the first browser test revealed a missing transitive editor dependency on InteractiveVideo1.27. The separate official InteractiveVideo Hub bundle adds version1.27.9, yielding a71-library dependency-checked closure with identical shared-library bytes. The broader dependency closure is necessary for the upstream editor even though the proposed composer accepts only the three bounded node types. No dependency manifests are stripped or rewritten to conceal incompatibility.

Exact URLs, hashes and installed-library file hashes are in native/profile.json and native/library-profile.json. Setup halts when official downloaded bytes do not match the profile. It does not silently adopt a new patch.

Do not infer [Lumi Desktop compatibility](https://github.com/Lumieducation/Lumi/issues/2738), current-master compatibility, or successful native browser interaction from successful server startup. Native single-node author/import/edit/save/export/replay and all three four-node fixture authoring/reimport/playback passed in sandboxed CI at [run37239898535](https://github.com/Masanori-Spec/branch-splice/actions/runs/37239898535). Merged composer downloads still require their own native acceptance results.

## Gate before implementation

1. Native editor creates a real text item, saves it, and actually downloads an editable .h5p
2. The actual download is imported, edited in the upstream editor, saved, replayed visibly, and exported again
3. Three four-node modules are authored through the upstream editor, with two different synthetic map images
4. Only after this consumer path works is the merger implemented
5. Actual composer downloads must later pass independent file reading, graph/media corruption negative controls, native import/edit/save/export, and playback of all four and six complete routes

No product readiness claim is made while these gates are pending.
