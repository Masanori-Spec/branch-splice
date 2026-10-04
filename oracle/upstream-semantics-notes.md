# Upstream interpretation and bounded profile

Reviewed 2026-10-04. These are primary sources, not product-implementation helpers.

## Branching Scenario 1.8.14

- [Tagged semantics](https://raw.githubusercontent.com/h5p/h5p-branching-scenario/1.8.14/semantics.json)
- [Tagged library declaration](https://raw.githubusercontent.com/h5p/h5p-branching-scenario/1.8.14/library.json)

The tagged declaration states BranchingScenario 1.8.14 and Core API 1.26.
The semantics wrap parameters in `branchingScenario`; content is an array. Each
node has a library-valued `type` and navigation lives in `nextContentId`.
The ending-title field is an HTML widget with paragraph enter mode. Before any
native fixture/product export existed, contract revision 1 explicitly changed
its raw expected value to `<p>Branch complete</p>`, preserving strict equality.
The three selected child-library lines are AdvancedText 1.1, Image 1.1, and
BranchingQuestion 1.0. End screens include title, subtitle and content ID.

The exact installed official 1.8.14 sources were also inspected read-only at
`native/runtime/libraries/H5P.BranchingScenario-1.8/src/scripts/`:

- `h5p-branching-scenario.js` lines 59–66 unwrap parameters and overwrite node IDs
  from array position; lines 532–536 use array lookup for navigation
- `libraryScreen.js` lines 280–285 send custom ending feedback whenever an
  `endScreenScore` field exists, even when its value is zero; the oracle therefore
  rejects that field under this default-ending fixture contract

This profile deliberately uses only the shared default -1 ending and no custom
feedback. Other negative endings are an upstream feature, not claimed support in
this narrow fixture contract. Native Core 1.27 integration remains separately
gated by the main task; the source declaration alone is not compatibility proof.

## Child types

- [BranchingQuestion semantics](https://raw.githubusercontent.com/h5p/h5p-branching-question/master/semantics.json):
  choices live under a `branchingQuestion` group; alternatives have text and
  target ID; negative target IDs denote end screens
- [Image semantics](https://raw.githubusercontent.com/h5p/h5p-image/master/semantics.json):
  image data is the typed `file` field, with separate `alt` and optional title
- [AdvancedText semantics](https://raw.githubusercontent.com/h5p/h5p-advanced-text/master/semantics.json):
  node content is HTML in the text field

Master sources clarify field meaning; fixture acceptance is anchored to the
installed/tagged BranchingScenario profile and explicit manifest child versions.

## Root behaviour and native-edit contract revision 2

The exact installed semantics mark backward navigation, forced-content completion,
and question randomization as optional boolean fields, each defaulting to false.
Revision 2 explicitly freezes these false values and adds the planned
A0 native-edit literal before native fixtures/product output exist. It does not
change any graph or media expectation.
