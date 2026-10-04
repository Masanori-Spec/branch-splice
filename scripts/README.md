# Build and private fixture reconstruction

Build the standalone user-file application with `npm run build`. It contains no upstream H5P packages or example archives. `prepare-fixtures.mjs` separately uses hash-pinned official packages already acquired by native:setup plus our authored JSON/PNGs to reconstruct private test inputs. Complete entry digests prove that repacking preserves the originally accepted native exports' file bytes. Reconstructed packages stay ignored and are not public workflow artifacts.
