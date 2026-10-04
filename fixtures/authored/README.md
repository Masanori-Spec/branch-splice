# Authored fixture content only

These are the exact authored JSON entry bytes from the three native-editor test documents accepted at run37239898535. The synthetic maps are in ../registration and ../room. No upstream library software or native H5P archives is distributed here.

Run `npm run native:setup` and `npm run fixture:prepare` locally to acquire the hash-pinned official packages and reconstruct private test archives. The recipe verifies every reconstructed entry against the accepted native documents' file-entry digest. Repacking changes ZIP headers and archive hashes; it does not change authored content or library entry bytes. Reconstructed .h5p files and upstream packages stay ignored and are not public workflow artifacts.
