/**
 * Real upstream native consumer of the product's browser-downloaded H5P files.
 * Run only on the hosted Linux CI runner. No product merger or traversal helper
 * is imported; the frozen handwritten manifest is the expected-screen contract.
 */
import {chromium, expect} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

function options() {
  const result = {
    inputRoot: process.env.NATIVE_MERGED_INPUT_ROOT || 'artifacts/browser',
    outputRoot: process.env.NATIVE_MERGED_OUTPUT_ROOT || 'artifacts/native-merged',
    explicitInput: Boolean(process.env.NATIVE_MERGED_INPUT_ROOT),
  };
  for (let i = 2; i < process.argv.length; i++) {
    const flag = process.argv[i];
    assert(['--input-root', '--output-root'].includes(flag), `Unknown argument: ${flag}`);
    const value = process.argv[++i];
    assert(value && !value.startsWith('--'), `${flag} requires a directory`);
    result[flag === '--input-root' ? 'inputRoot' : 'outputRoot'] = value;
    if (flag === '--input-root') result.explicitInput = true;
  }
  return result;
}

const opts = options();
const inputRoot = path.resolve(opts.inputRoot);
const out = path.resolve(opts.outputRoot);
const manifestPath = path.resolve('oracle/expected-manifest.json');
const manifestBytes = await fs.readFile(manifestPath);
const expected = JSON.parse(manifestBytes);
const hostScenario = JSON.parse(await fs.readFile('fixtures/authored/module-A.content.json','utf8')).branchingScenario;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = [
  {name: 'first', contract: 'first_splice', routes: 4},
  {name: 'shared', contract: 'shared_c', routes: 6},
];
const origin = 'http://127.0.0.1:8080';
const report = {
  status: 'RUNNING',
  gate: 'native-consumer-of-product-browser-downloads',
  startedUtc: new Date().toISOString(),
  inputRoot,
  inputMode: opts.explicitInput ? 'explicit-debug-input-root' : 'default-product-browser-downloads',
  expectedManifest: {path: manifestPath, sha256: sha256(manifestBytes)},
  execution: {githubActions: process.env.GITHUB_ACTIONS, runnerOS: process.env.RUNNER_OS,
    runId: process.env.GITHUB_RUN_ID, commit: process.env.GITHUB_SHA},
  nativeEditorPlayer: {server: '10.0.4', core: '1.27', mainLibrary: 'H5P.BranchingScenario 1.8.14'},
  cases: [], artifactGroups: [],
  method: 'Import the actual source files through the native form; inspect the 12-node native graph; change only A0 using the active native CKEditor public setData API; save and use the actual Download link. Replay every frozen choice sequence through displayed native controls, asserting exact rendered HTML, image bytes, and endings. Independent Python archive oracle runs before and after the native edit.',
  runtimeHTMLPolicy: 'Only a direct div.resize-triggers with exactly one expand-trigger and one contract-trigger is removed from a CLONE of AdvancedText DOM. The archive oracle remains strict and unmodified.',
  offlineBoundary: 'Local server CSP and browser request routing block optional remote help. Any actual external response, HTTP error, or uncaught page error fails the gate.',
};
await fs.mkdir(out, {recursive: true});
let server;
let serverLogs = '';
let browser;
let command;
let activeContext;
let activePage;
let activeSegment;
let currentCase;
let caughtError;

const writeJSON = async (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
function isLocal(url) {
  try { return new URL(url).origin === origin; } catch { return false; }
}
function isNonNetwork(url) { return /^(data:|blob:|about:)/.test(url); }
async function fileRecord(file) {
  const bytes = await fs.readFile(file);
  return {path: file, bytes: bytes.length, sha256: sha256(bytes)};
}

async function runOracle(file, contract, dest, nativeEdit = false) {
  const args = ['oracle/verify_package.py', file, '--case', contract, '--manifest', manifestPath, '--report', dest];
  if (nativeEdit) args.push('--native-edit');
  const child = spawn('python3', args, {stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '';
  child.stdout.on('data', b => stdout += b);
  child.stderr.on('data', b => stderr += b);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  await fs.writeFile(dest.replace(/\.json$/, '.log'), stdout + stderr);
  assert.equal(code, 0, `Independent oracle failed for ${file}: ${stdout}\n${stderr}`);
  const result = JSON.parse(await fs.readFile(dest, 'utf8'));
  assert.equal(result.status, 'PASS');
  assert.equal(result.node_count, 12);
  assert.equal(result.trace_count, expected.cases[contract].traces.length);
  assert.equal(result.variant, nativeEdit ? 'native_edit' : 'original');
  const actualZip=await JSZip.loadAsync(await fs.readFile(file)),actualScenario=JSON.parse(await actualZip.file('content/content.json').async('string')).branchingScenario;
  for(const key of ['startScreen','endScreens','behaviour','scoringOptionGroup','l10n'])assert.deepEqual(actualScenario[key],hostScenario[key],`Native package retains the authored host ${key}`);
  result.hostGlobalsPreserved=['startScreen','endScreens','behaviour','scoringOptionGroup','l10n'];
  execFileSync('python3',['oracle/sanitize_evidence.py',file,'--case',contract,'--report',dest.replace(/\.json$/, '-sanitized.json'),...(nativeEdit?['--native-edit']:[])],{stdio:'inherit'});
  return {report: path.relative(out, dest), ...result};
}

async function inspectArchive(file) {
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const content = JSON.parse(await zip.file('content/content.json').async('string'));
  const libraries = [];
  for (const name of Object.keys(zip.files).filter(name => /^[^/]+\/library\.json$/.test(name)).sort()) {
    const metadata = JSON.parse(await zip.file(name).async('string'));
    libraries.push({machineName: metadata.machineName, version: `${metadata.majorVersion}.${metadata.minorVersion}.${metadata.patchVersion}`});
  }
  const main = libraries.find(library => library.machineName === 'H5P.BranchingScenario');
  assert.equal(main?.version, '1.8.14', 'The browser download must include the pinned official native library');
  assert.equal(content.branchingScenario.content.length, 12);
  return {nodes: content.branchingScenario.content.length, bundledLibraries: libraries};
}

async function startSegment(relative) {
  assert(!activeSegment, 'Previous trace segment was not closed');
  const directory = path.join(out, relative);
  await fs.mkdir(directory, {recursive: true});
  await activeContext.tracing.start({screenshots: true, snapshots: true, sources: true});
  activeSegment = {directory, relative};
  return directory;
}
async function stopSegment() {
  if (!activeSegment) return;
  const segment = activeSegment;
  await activeContext.tracing.stop({path: path.join(segment.directory, 'trace.zip')});
  report.artifactGroups.push({name: `native-merged-${segment.relative.replaceAll('/', '-')}`, path: segment.relative});
  activeSegment = undefined;
}

/** No screenshots or clicks may rely on an offscreen, moving native screen. */
async function stableVisible(target) {
  await target.waitFor({state: 'visible'});
  let previous = null;
  let stableSamples = 0;
  let latest = null;
  for (let sample = 0; sample < 100; sample++) {
    const box = await target.boundingBox();
    const viewport = activePage.viewportSize();
    const fullyWithin = box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 &&
      box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
    const same = previous && box && ['x', 'y', 'width', 'height'].every(key => Math.abs(box[key] - previous[key]) < 0.25);
    stableSamples = fullyWithin ? (same ? stableSamples + 1 : 1) : 0;
    latest = {box, viewport, stableSamples};
    if (stableSamples >= 3) return latest;
    previous = fullyWithin ? box : null;
    await activePage.waitForTimeout(120);
  }
  throw Error(`Native content did not stabilize fully inside the viewport: ${JSON.stringify(latest)}`);
}

async function capture(directory, name, targets) {
  const visibility = [];
  for (const target of targets) visibility.push(await stableVisible(target));
  await activePage.screenshot({path: path.join(directory, `${name}.png`), fullPage: false});
  return {screenshot: path.relative(out, path.join(directory, `${name}.png`)), visibility};
}
async function dumpDOM(directory, name) {
  for (const [i, frame] of activePage.frames().entries()) {
    await fs.writeFile(path.join(directory, `${name}-frame${i}.html`), await frame.content());
  }
}
async function dismissTour(frame) {
  for (let i = 0; i < 4; i++) {
    const gotIt = frame.getByRole('button', {name: 'I got it', exact: true});
    if (!await gotIt.isVisible()) return;
    await gotIt.click();
    await gotIt.waitFor({state: 'hidden'});
    currentCase.steps.push('Dismissed the native I got it tour through its displayed button');
  }
}
async function expandAncestors(target) {
  const groups = target.locator('xpath=ancestor::fieldset[contains(@class,"group")]');
  for (let i = 0; i < await groups.count(); i++) {
    const title = groups.nth(i).locator(':scope > .title');
    if (await title.count() && await title.getAttribute('aria-expanded') === 'false') await title.click();
  }
}

async function importEditDownload(testCase, input) {
  const directory = await startSegment(`${testCase.name}/import-edit`);
  const editor = activePage.frameLocator('iframe.h5p-editor-iframe');
  await activePage.goto(origin + '/');
  await activePage.locator('input[type=file]').setInputFiles(input);
  await activePage.getByRole('button', {name: 'Import', exact: true}).click();
  await activePage.waitForURL(/\/h5p\/edit\/[^/]+$/);
  currentCase.importedEditorURL = activePage.url();
  await editor.locator('.content-type-buttons li.advancedtext').waitFor();
  await dismissTour(editor);
  const labels = editor.locator('.nodetree .draggable-label');
  await expect(labels).toHaveCount(12);
  await editor.locator('.fit-to-canvas').click();
  currentCase.importedGraph = {
    nodeCount: await labels.count(),
    labels: await labels.allTextContents(),
    ...await capture(directory, '01-imported-twelve-node-graph', [editor.locator('.nodetree')]),
  };
  await dumpDOM(directory, '01-imported-graph');
  currentCase.steps.push('Imported the exact browser-downloaded source through the native upload form and inspected all 12 native graph nodes');

  const originalHTML = expected.node_content.A0.text;
  const editedHTML = expected.native_edit.node_content_overrides.A0.text;
  const welcome = editor.locator('.nodetree .draggable-label.advancedtext')
    .filter({hasText: 'Welcome to BranchSplice.'});
  await expect(welcome).toHaveCount(1);
  await stableVisible(welcome);
  await welcome.dblclick();
  await editor.locator('.editor-overlay').waitFor();
  await dismissTour(editor);
  const field = editor.locator('.editor-overlay-semantics .field-name-text');
  await expandAncestors(field);
  await field.locator('[contenteditable=true]').first().click();
  await activePage.waitForFunction(() => window.nativeEditor?.iframeWindow?.H5PEditor?.Html?.current?.ckeditor);
  // The only writable page evaluation: the selected native CKEditor public API.
  // Neither the native routing state nor any JSON graph is seeded or rewritten.
  const before = await activePage.evaluate(() => window.nativeEditor.iframeWindow.H5PEditor.Html.current.ckeditor.getData());
  assert.equal(before, originalHTML, 'The selected native rich-text field must be A0');
  await activePage.evaluate(html => window.nativeEditor.iframeWindow.H5PEditor.Html.current.ckeditor.setData(html), editedHTML);
  const after = await activePage.evaluate(() => window.nativeEditor.iframeWindow.H5PEditor.Html.current.ckeditor.getData());
  assert.equal(after, editedHTML);
  await activePage.locator('#save-h5p').focus();
  await field.locator('[contenteditable=true]').first().scrollIntoViewIfNeeded();
  currentCase.nativeEdit = {node: 'A0', before, after,
    ...await capture(directory, '02-native-a0-edit', [field.locator('[contenteditable=true]').first()])};
  await editor.locator('.editor-overlay-header button.button-blue').click();
  await editor.locator('.editor-overlay').waitFor({state: 'hidden'});
  await activePage.locator('#save-h5p').click();
  await activePage.waitForURL(/\/h5p\/play\/[^/]+$/);
  const playerURL = activePage.url();
  const downloadLink = activePage.getByRole('link', {name: 'Download', exact: true});
  await expect(downloadLink).toHaveCount(1);
  const downloadHref = await downloadLink.getAttribute('href');
  assert(isLocal(new URL(downloadHref, playerURL).href), 'Native download must be served by the local native consumer');
  const event = activePage.waitForEvent('download');
  await downloadLink.click();
  const download = await event;
  const output = path.join(out, `${testCase.name}-native-edited.h5p`);
  await download.saveAs(output);
  assert.equal(await download.failure(), null);
  currentCase.nativeDownload = {...await fileRecord(output), url: download.url(), linkHref: downloadHref,
    suggestedFilename: download.suggestedFilename(), playerURL};
  assert.notEqual(currentCase.nativeDownload.sha256, currentCase.source.sha256, 'The actual native download must contain the requested edit');
  currentCase.outputOracle = await runOracle(output, testCase.contract, path.join(directory, 'native-edited-oracle.json'), true);
  currentCase.steps.push('Changed only the A0 rich-text field in the native editor, saved, and downloaded the native export through its displayed Download link');
  await dumpDOM(directory, '03-saved-native-player');
  await stopSegment();
  return playerURL;
}

async function playerView(url) {
  await activePage.goto(url);
  await activePage.waitForFunction(() => document.querySelector('.h5p-branching-scenario,iframe.h5p-iframe'));
  return await activePage.locator('iframe.h5p-iframe').count()
    ? activePage.frameLocator('iframe.h5p-iframe') : activePage;
}

async function replayRoute(testCase, routeIndex, playerURL) {
  const contract = expected.cases[testCase.contract];
  const directory = await startSegment(`${testCase.name}/route-${String(routeIndex + 1).padStart(2, '0')}`);
  const view = await playerView(playerURL);
  const route = {status: 'RUNNING', number: routeIndex + 1,
    expectedTrace: contract.traces[routeIndex], expectedChoices: contract.choice_sequences[routeIndex],
    actualTrace: [], actualChoices: [], screens: []};
  currentCase.routes.push(route);
  const start = view.locator('.h5p-start-button:visible');
  await stableVisible(start);
  const opening=view.locator('.h5p-start-screen.h5p-current-screen'),openingTitle=opening.locator('.h5p-branching-scenario-title-text'),openingSubtitle=opening.locator('.h5p-branching-scenario-subtitle-text');
  await stableVisible(openingTitle);await stableVisible(openingSubtitle);
  assert.equal(await openingTitle.innerHTML(),hostScenario.startScreen.startScreenTitle);assert.equal(await openingSubtitle.innerHTML(),hostScenario.startScreen.startScreenSubtitle);
  route.opening={...hostScenario.startScreen,...await capture(directory,'00-host-opening',[openingTitle,openingSubtitle,start])};
  await start.click();
  let choiceOffset = 0;
  for (const [step, nodeIndex] of route.expectedTrace.entries()) {
    const token = contract.nodes[nodeIndex];
    const node = {...expected.node_content[token], ...expected.native_edit.node_content_overrides[token]};
    const stem = `${String(step + 1).padStart(2, '0')}-${token}`;
    const screen = {nodeIndex, token};
    if (node.text) {
      const visibleText = node.text.match(/<p>(.*?)<\/p>/)?.[1];
      assert(visibleText, `No frozen visible paragraph for ${token}`);
      const text = view.locator('.h5p-advanced-text:visible').filter({hasText: visibleText});
      await expect(text).toHaveCount(1);
      await stableVisible(text);
      const rendered = await text.evaluate(element => {
        const clone = element.cloneNode(true);
        let removedSensors = 0;
        for (const sensor of clone.querySelectorAll(':scope > div.resize-triggers')) {
          if (sensor.children.length !== 2 || sensor.querySelectorAll(':scope > .expand-trigger').length !== 1 ||
            sensor.querySelectorAll(':scope > .contract-trigger').length !== 1) {
            throw Error('Unexpected AdvancedText resize sensor structure');
          }
          sensor.remove();
          removedSensors++;
        }
        return {html: clone.innerHTML, removedSensors};
      });
      assert.equal(rendered.html, node.text, `Visible ${token} HTML must exactly match the frozen contract`);
      const proceed = view.locator('.h5p-proceed-button:visible');
      await expect(proceed).toHaveCount(1);
      Object.assign(screen, rendered, await capture(directory, stem, [text, proceed]));
      route.actualTrace.push(nodeIndex);
      route.screens.push(screen);
      await proceed.click();
    }
    else if (node.image) {
      const image = view.locator(`img[alt="${node.alt}"]:visible`);
      await expect(image).toHaveCount(1);
      await expect(image).toHaveJSProperty('complete', true);
      await stableVisible(image);
      const loaded = await image.evaluate(async element => {
        const src = element.currentSrc || element.src;
        const response = await fetch(src);
        if (!response.ok) throw Error(`Image fetch failed: ${response.status}`);
        const bytes = await response.arrayBuffer();
        return {src, width: element.naturalWidth, height: element.naturalHeight,
          bytes: bytes.byteLength, sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
            .map(value => value.toString(16).padStart(2, '0')).join('')};
      });
      const pin = expected.images[node.image];
      assert(isLocal(loaded.src), 'Displayed image must resolve from the native imported content');
      assert.equal(loaded.width, pin.width);
      assert.equal(loaded.height, pin.height);
      assert.equal(loaded.bytes, pin.size_bytes);
      assert.equal(loaded.sha256, pin.sha256, `${token} must display its own original image bytes`);
      const proceed = view.locator('.h5p-proceed-button:visible');
      await expect(proceed).toHaveCount(1);
      Object.assign(screen, {image: node.image, alt: node.alt, loaded}, await capture(directory, stem, [image, proceed]));
      route.actualTrace.push(nodeIndex);
      route.screens.push(screen);
      await proceed.click();
    }
    else {
      const question = view.locator('.h5p-branching-question-title:visible');
      await expect(question).toHaveCount(1);
      await stableVisible(question);
      assert.equal(await question.innerHTML(), node.question, `${token} visible question HTML`);
      const alternatives = view.locator('.h5p-branching-question-alternative:visible');
      await expect(alternatives).toHaveCount(node.choices.length);
      const visibleChoices = await alternatives.allTextContents();
      assert.deepEqual(visibleChoices, node.choices, `${token} full displayed choice labels/order`);
      const chosenLabel = route.expectedChoices[choiceOffset++];
      const chosenIndex = visibleChoices.indexOf(chosenLabel);
      assert(chosenIndex >= 0, `Frozen choice ${chosenLabel} is not displayed`);
      const targets = [question];
      for (let index = 0; index < visibleChoices.length; index++) targets.push(alternatives.nth(index));
      Object.assign(screen, {question: node.question, choices: visibleChoices, chosenLabel}, await capture(directory, stem, targets));
      route.actualTrace.push(nodeIndex);
      route.actualChoices.push(chosenLabel);
      route.screens.push(screen);
      await alternatives.nth(chosenIndex).click();
    }
  }
  const ending = view.locator('.h5p-end-screen.h5p-current-screen');
  const title = ending.locator('.h5p-branching-scenario-title-text');
  const subtitle = ending.locator('.h5p-branching-scenario-subtitle-text');
  await stableVisible(title);
  await stableVisible(subtitle);
  assert.equal(await title.innerHTML(), expected.ending.title);
  assert.equal(await subtitle.innerHTML(), expected.ending.subtitle);
  route.ending = {...expected.ending, ...await capture(directory, 'ending', [title, subtitle])};
  assert.equal(choiceOffset, route.expectedChoices.length);
  assert.deepEqual(route.actualTrace, route.expectedTrace);
  assert.deepEqual(route.actualChoices, route.expectedChoices);
  route.status = 'PASS';
  await writeJSON(path.join(directory, 'route-report.json'), route);
  await dumpDOM(directory, 'ending');
  await stopSegment();
}

function attachDiagnostics(context, page, record) {
  page.on('pageerror', error => record.pageErrors.push(error.message));
  context.on('request', request => {
    if (!isLocal(request.url()) && !isNonNetwork(request.url())) record.attemptedExternalRequests.push(request.url());
  });
  context.on('response', response => {
    if (!isLocal(response.url()) && !isNonNetwork(response.url())) record.externalResponses.push({url: response.url(), status: response.status()});
    if (response.status() >= 400) record.httpErrors.push({url: response.url(), status: response.status()});
  });
  context.on('requestfailed', request => record.requestFailures.push({url: request.url(), error: request.failure()?.errorText}));
  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) record.consoleDiagnostics.push({type: message.type(), text: message.text()});
  });
}

async function directoryBytes(directory) {
  let bytes = 0;
  for (const item of await fs.readdir(directory, {withFileTypes: true})) {
    const itemPath = path.join(directory, item.name);
    bytes += item.isDirectory() ? await directoryBytes(itemPath) : (await fs.stat(itemPath)).size;
  }
  return bytes;
}

try {
  // Explicitly fail closed rather than trying a known unsupported local sandbox.
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run this native browser consumer on hosted GitHub Actions only; local browser execution is not permitted');
  assert.equal(process.env.RUNNER_OS, 'Linux', 'This gate requires the hosted Linux Chrome runner');
  for (const testCase of cases) {
    const source = path.join(inputRoot, `${testCase.name}.h5p`);
    const stat = await fs.stat(source).catch(() => null);
    assert(stat?.isFile() && stat.size > 0, `Missing required browser download: ${source}. No CLI-generated substitute is permitted`);
  }
  // Avoid treating somebody else's already-running server as the spawned server.
  let occupied = false;
  try { occupied = (await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)})).ok; } catch {}
  assert(!occupied, 'Port 8080 is already occupied; stop the prior verification server before this gate');
  server = spawn(process.execPath, ['native/server.mjs'], {stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, PORT: '8080'}});
  server.stdout.on('data', buffer => serverLogs += buffer);
  server.stderr.on('data', buffer => serverLogs += buffer);
  let serverSpawnError;
  server.on('error', error => { serverSpawnError = error; });
  let healthy = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (serverSpawnError) throw serverSpawnError;
    assert(server.exitCode === null, `Native server exited before readiness: ${serverLogs}`);
    try {
      const response = await fetch(origin + '/health', {signal: AbortSignal.timeout(1000)});
      if (response.ok) { report.serverHealth = await response.json(); healthy = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(healthy, `Native server never became ready: ${serverLogs}`);
  browser = await chromium.launch({headless: true, chromiumSandbox: true,
    ...(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {})});
  const cdp = await browser.newBrowserCDPSession();
  command = await cdp.send('Browser.getBrowserCommandLine');
  assert(!command.arguments.some(argument => ['--no-sandbox', '--disable-setuid-sandbox'].includes(argument)), 'The browser sandbox must remain enabled');
  report.browser = {version: browser.version(), chromiumSandbox: true, commandReport: 'browser-command.json'};
  await writeJSON(path.join(out, 'browser-command.json'), command);
  for (const testCase of cases) {
    currentCase = {name: testCase.name, contract: testCase.contract, status: 'RUNNING', steps: [], routes: [],
      pageErrors: [], httpErrors: [], externalResponses: [], attemptedExternalRequests: [], blockedExternalRequests: [],
      requestFailures: [], consoleDiagnostics: []};
    report.cases.push(currentCase);
    const source = path.join(inputRoot, `${testCase.name}.h5p`);
    currentCase.source = await fileRecord(source);
    currentCase.sourceArchive = await inspectArchive(source);
    const inputChecks = path.join(out, testCase.name, 'input-checks');
    await fs.mkdir(inputChecks, {recursive: true});
    currentCase.inputOracle = await runOracle(source, testCase.contract, path.join(inputChecks, 'input-oracle.json'));
    report.artifactGroups.push({name: `native-merged-${testCase.name}-input-checks`, path: `${testCase.name}/input-checks`});
    activeContext = await browser.newContext({viewport: {width: 1600, height: 1200}, acceptDownloads: true, serviceWorkers: 'block'});
    activePage = await activeContext.newPage();
    activePage.setDefaultTimeout(20000);
    attachDiagnostics(activeContext, activePage, currentCase);
    await activeContext.route('**/*', route => {
      const url = route.request().url();
      if (isLocal(url) || isNonNetwork(url)) return route.continue();
      currentCase.blockedExternalRequests.push(url);
      return route.abort('blockedbyclient');
    });
    const playerURL = await importEditDownload(testCase, source);
    for (let route = 0; route < testCase.routes; route++) await replayRoute(testCase, route, playerURL);
    assert.equal(currentCase.routes.length, testCase.routes);
    assert.deepEqual(currentCase.routes.map(route => route.actualTrace), expected.cases[testCase.contract].traces);
    assert.deepEqual(currentCase.routes.map(route => route.actualChoices), expected.cases[testCase.contract].choice_sequences);
    assert.deepEqual(currentCase.pageErrors, [], 'Uncaught native page errors');
    assert.deepEqual(currentCase.httpErrors, [], 'Native HTTP errors');
    assert.deepEqual(currentCase.externalResponses, [], 'Actual external network responses are forbidden');
    const observedImages = new Map(currentCase.routes.flatMap(route => route.screens)
      .filter(screen => screen.image).map(screen => [screen.image, screen.loaded.sha256]));
    assert.equal(observedImages.size, 2, 'Both distinct source images must actually be displayed');
    assert.notEqual(observedImages.get('registration'), observedImages.get('room'));
    currentCase.status = 'PASS';
    currentCase.steps.push(`All ${testCase.routes} complete post-edit native player routes passed exact displayed screens, choices, ending, and original image-byte checks`);
    await writeJSON(path.join(out, `${testCase.name}-report.json`), currentCase);
    await activeContext.close();
    activeContext = undefined;
    activePage = undefined;
  }
  report.status = 'PASS';
}
catch (error) {
  caughtError = error;
  report.status = 'FAIL';
  report.error = error.stack || String(error);
  if (currentCase) { currentCase.status = 'FAIL'; currentCase.error = report.error; }
  if (activePage) {
    const directory = activeSegment?.directory || out;
    await activePage.screenshot({path: path.join(directory, 'failure.png'), fullPage: true}).catch(() => {});
    await dumpDOM(directory, 'failure').catch(() => {});
  }
}
finally {
  try { await stopSegment(); } catch (error) {
    report.traceError = error.stack || String(error); report.status = 'FAIL'; caughtError ||= error;
  }
  await activeContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  server?.kill('SIGTERM');
  await fs.writeFile(path.join(out, 'server.log'), serverLogs);
  if (currentCase) await writeJSON(path.join(out, `${currentCase.name}-report.json`), currentCase);
  // Keep export, summary, import/edit, and EACH route as distinct upload groups.
  // Their paths are supplied in artifact-groups.json for exact CI upload routing.
  report.finishedUtc = new Date().toISOString();
  report.artifactGroups.unshift({name: 'native-merged-exports', files: cases.map(item => `${item.name}-native-edited.h5p`)},
    {name: 'native-merged-summary', files: ['report.json', 'first-report.json', 'shared-report.json', 'server.log', 'browser-command.json', 'artifact-groups.json']});
  // Write first, then measure all files (including the summaries themselves).
  // A small fixed-point pass handles the byte-count digits in these two JSONs.
  for (let pass = 0; pass < 5; pass++) {
    await writeJSON(path.join(out, 'artifact-groups.json'), report.artifactGroups);
    await writeJSON(path.join(out, 'report.json'), report);
    let changed = false;
    for (const group of report.artifactGroups) {
      const bytes = group.path ? await directoryBytes(path.join(out, group.path)) :
        (await Promise.all(group.files.map(async file =>
          (await fs.stat(path.join(out, file)).catch(() => ({size: 0}))).size)))
          .reduce((a, b) => a + b, 0);
      changed ||= bytes !== group.bytes;
      group.bytes = bytes;
      if (bytes >= 32 * 1024 * 1024) {
        report.status = 'FAIL';
        report.artifactLimitError = `${group.name} is ${bytes} bytes; split this group before delivery`;
        caughtError ||= Error(report.artifactLimitError);
      }
    }
    if (!changed) break;
  }
  await writeJSON(path.join(out, 'artifact-groups.json'), report.artifactGroups);
  await writeJSON(path.join(out, 'report.json'), report);
  console.log(JSON.stringify({status: report.status, report: path.join(out, 'report.json'),
    cases: report.cases.map(item => ({name: item.name, status: item.status, routes: item.routes.filter(route => route.status === 'PASS').length}))}));
}
if (caughtError) throw caughtError;
