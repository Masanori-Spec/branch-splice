# Third-party notices and source locations

BranchSplice does not relicense upstream libraries. Public app/source delivery does not contain H5P package or content-library bytes. Local native verification acquires packages directly from their official sources and keeps them on the local machine or ephemeral CI runner. The pinned inventories and official download URLs are in `native/library-profile.json` and `native/profile.json`; SHA-256 validation rejects silently changed downloads.

- Lumi H5P Node.js packages 10.0.4: GPL-3.0-or-later; [official source/release](https://github.com/Lumieducation/H5P-Nodejs-library/tree/v10.0.4). The harness imports its renderer and server APIs, adapting renderer output to select BranchingScenario 1.8 and expose the native editor for tests
- H5P core/editor and content libraries: their original per-library licenses and copyright notices remain within each package. [H5P official source organization](https://github.com/h5p), [H5P licensing information](https://h5p.org/licensing)
- fflate 0.8.2: MIT, Copyright (c) 2023 Arjun Barrett; [source](https://github.com/101arrowz/fflate/tree/v0.8.2)
- parse5 7.3.0: MIT, Copyright (c) 2013–2019 Ivan Nikulin; [source](https://github.com/inikulin/parse5/tree/v7.3.0)
- esbuild 0.25.11: MIT; build tool, [source](https://github.com/evanw/esbuild/tree/v0.25.11)
- Playwright 1.56.0: Apache-2.0; test tool, [source](https://github.com/microsoft/playwright/tree/v1.56.0)

The standalone HTML embeds only the BranchSplice application, fflate, parse5 and its entities dependency. It does not embed native H5P software, example H5Ps, or upstream editor assets. Local fixture reconstruction uses exact authored JSON, original image bytes, a file-entry digest and official-package downloads. Synthetic orientation text and maps were created for this fixture and contain no real person or institution data.

## MIT permission notice (fflate and parse5)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## entities (parse5 dependency)

BSD-2-Clause; exact installed-package notice follows.

Copyright (c) Felix Böhm
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS,
EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
