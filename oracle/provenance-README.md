# Independent actual-archive provenance check

`verify_provenance.py` is a separate Python standard-library ZIP/JSON reader. It
imports neither the product nor the frozen graph/content oracle. It validates
real archive bytes against their claimed transformation and sidecar manifest.
Run `verify_package.py` separately to establish the handwritten fixture outcome.

## CI invocation after a product browser download

```sh
python3 oracle/verify_provenance.py \
  ACTUAL_DOWNLOADED_OUTPUT.h5p ACTUAL_DOWNLOADED_MANIFEST.json \
  --source-a fixtures/h5p/module-A.h5p \
  --source-b fixtures/h5p/module-B.h5p \
  --source-c fixtures/h5p/module-C.h5p \
  --text-report ACTUAL_DOWNLOADED_REPORT.txt \
  --report PROVENANCE_RESULT.json
```

Both `--text-report` and `--report` are optional. Exit status 0 is PASS; status 1
is failure. All input/output archives are read without extraction or mutation.
The source paths must be the **exact archives used by that browser export**.
Reconstruction changes ZIP hashes, so do not substitute the historical native
export when the browser was supplied reconstructed inputs, or vice versa.

The three source arguments map to the manifest's three input records in order.
IDs such as `M1` or `input-7-1` are supported. IDs must be distinct, nonempty,
bounded, and control-character-free. Each association is checked against the
actual source filename, whole archive hash, byte count, content, and metadata;
swapping manifest records or source arguments is not silently accepted.

## Assertions

- Actual source/output archive SHA-256, byte counts, content JSON byte hash, and
  complete input metadata snapshots
- Appended node offsets and exact mapping of every source node without cloning
- Canonical source/output node hashes, host UUID preservation, globally unique
  donor UUIDv4 values that do not reuse any UUID from any source
- Reconstruction of each complete source node allowing only declared graph
  connections, local-to-global target remapping, donor UUID changes, and
  changes at validated typed image path fields
- Exact preservation of all other node fields, nested metadata, feedback,
  literal strings, host globals, and package metadata
- Exact ordered union of package dependencies; byte-for-byte union of **every**
  supplied library/resource file with no omissions, additions, or conflicts
- All bundled library declarations, transitive declared dependencies, and
  declared JS/CSS resource availability
- Typed image pointers in both source and output, exact asset bytes, dimensions,
  MIME values, rename records, and complete accounting of content asset files
- Actual graph traces, choice labels, ending/feedback records, summary counts,
  and optional report lines against recomputed values

The check is deliberately bounded to the three-module merge profile used by the
acceptance gate. Arbitrary native editor re-exports are not expected to match a
merger manifest: native save changes ZIP hashes, UUIDs, or media filenames. Run
the separate frozen oracle and native-specific gate for those artifacts. The
optional text-report check currently supports scalar terminal connections, as
used by the four- and six-route fixtures.

A provenance-consistent connection plan could still be the wrong requested
plan. This is why the frozen exact-graph/content oracle remains a separate gate.
Likewise a static PASS is not proof that a UI download, native reimport, playback,
or pixel review occurred; those stages need their own execution evidence.

## Safe outputs and tests

The optional JSON result includes hashes, counts, and assertions naming files.
It never embeds source archives, library bytes, or executable upstream resources.
Archive artifacts can remain ephemeral in CI while safe JSON results are saved.

```sh
python3 -m unittest discover -s oracle -p 'test_provenance.py' -v
```

The tests author tiny synthetic checker-only packages. They include positive
arbitrary-ID cases and adversarial cases that recompute claimed output hashes
after tampering, ensuring hashes alone cannot hide modified text, metadata,
feedback, targets, UUIDs, media, or libraries. They are not native-player proof.
