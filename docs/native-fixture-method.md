# Native fixture method

The three A/B/C modules are created from an empty upstream Branching Scenario editor. Browser automation uses the actual native content-type menu and graph dropzones, native title/alternative/image controls, and CKEditor’s public rich-text field setData API. It does not seed graph JSON or import a product helper. The native save form and native player's Download link produce the first .h5p files.

The exact content and route expectations were handwritten and frozen before the merger existed. All maps are synthetic96×64 PNGs. Their original hashes are in the independent oracle manifest.

Lumi10.0.4 always random-suffixes uploaded/imported media names. To exercise a real archive-path collision, the script preserves each original native download, then normalizes only the donor image’s ZIP entry name and typed file.path to images/map.png. No content, route, image bytes, library code, library version, or dependency declarations are changed. These collision packages are reimported into the native editor, saved and exported again. Native roundtrip filenames may change again; image hashes and rendered maps must match.

Each native-roundtripped module is replayed through both choices, requiring the exact text/choice/ending content, loaded image dimensions and loaded-image SHA-256. Screenshots wait for stable, fully in-viewport content. The normalized collision inputs are the canonical merge fixtures; the native originals and native roundtrip downloads remain distinct evidence.

The current scripts are still under verification. Refer to exact CI results and artifact reports; this method document is not a claim that every stage has passed.
