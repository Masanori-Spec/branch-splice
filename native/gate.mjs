import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import JSZip from 'jszip';
const out=path.resolve('artifacts/native-gate');await fs.mkdir(out,{recursive:true});
const server=spawn(process.execPath,['native/server.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:'8080'}});let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8080/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
const cdp=await browser.newBrowserCDPSession();const command=await cdp.send('Browser.getBrowserCommandLine');assert(!command.arguments.some(x=>x==='--no-sandbox'||x==='--disable-setuid-sandbox'));
const context=await browser.newContext({viewport:{width:1500,height:1100},acceptDownloads:true});await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();page.setDefaultTimeout(15000);
const report={gate:'initial-native-author-export-reopen',complete:false,core:'1.27',server:'10.0.4',steps:[],errors:[],external:[],blockedExternalRequests:[],attemptedExternalRequests:[],httpErrors:[],consoleWarnings:[]};page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:8080')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:')&&!r.url().startsWith('about:'))report.attemptedExternalRequests.push(r.url())});
await context.route('**/*',route=>{const u=route.request().url();if(/^(http:\/\/127\.0\.0\.1:8080|data:|blob:|about:)/.test(u))return route.continue();report.blockedExternalRequests.push(u);return route.abort('blockedbyclient')});
page.on('response',r=>{if(!r.url().startsWith('http://127.0.0.1:8080'))report.external.push(r.url())});
page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({status:r.status(),url:r.url()})});page.on('console',m=>{if(['error','warning'].includes(m.type()))report.consoleWarnings.push({type:m.type(),text:m.text()})});
async function stableVisible(target){await target.waitFor();let previous=null,stable=0;for(let n=0;n<80;n++){const b=await target.boundingBox(),v=page.viewportSize();if(b&&b.x>=0&&b.y>=0&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1&&previous&&['x','y','width','height'].every(k=>Math.abs(b[k]-previous[k])<0.25))stable++;else stable=0;if(stable>=3)return;previous=b;await page.waitForTimeout(100);}throw Error('Edited native text is not stable and fully in viewport')}
async function dump(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});await fs.writeFile(path.join(out,name+'.html'),await page.content());for(const [i,f]of page.frames().entries())await fs.writeFile(path.join(out,name+`-frame${i}.html`),await f.content());}
try{
 await page.goto('http://127.0.0.1:8080/h5p/new');
 const f=page.frameLocator('iframe.h5p-editor-iframe');
 await f.locator('.content-type-buttons li.advancedtext').waitFor();
 await f.getByRole('button',{name:'I got it',exact:true}).click();await f.locator('.tour-button').waitFor({state:'hidden'});report.steps.push('Official native BranchingScenario editor loaded');await dump('01-editor-empty');
 await f.locator('.field-name-extraTitle input:visible').first().fill('BranchSplice native feasibility');
 await f.locator('.content-type-buttons li.advancedtext').click();await f.locator('.dropzone').first().click();
 await f.locator('.editor-overlay-semantics .field-name-text [contenteditable=true]').first().click();
 await f.locator('.editor-overlay-semantics .ck-editor__editable').fill('NATIVE GATE ORIGINAL');
 await dump('02-native-text-authoring');
 await f.locator('.editor-overlay-header button.button-blue').click();
 await page.locator('#save-h5p').click();await page.waitForURL(/\/h5p\/play\//);report.steps.push('New text authored in native editor and saved');await dump('03-native-player');
 const id=page.url().split('/').at(-1);const d=page.waitForEvent('download');await page.goto(`http://127.0.0.1:8080/export/${id}`).catch(e=>{if(!/Download is starting/.test(e.message))throw e});const downloaded=await d;const exported=path.join(out,'native-authored.h5p');await downloaded.saveAs(exported);const z=await JSZip.loadAsync(await fs.readFile(exported));const params=JSON.parse(await z.file('content/content.json').async('string'));assert.equal(params.branchingScenario.content.length,1);assert(params.branchingScenario.content[0].type.params.text.includes('NATIVE GATE ORIGINAL'));report.steps.push('Actual .h5p browser download has native-authored text');
 await page.goto('http://127.0.0.1:8080/');await page.locator('input[type=file]').setInputFiles(exported);await page.getByRole('button',{name:'Import',exact:true}).click();await page.waitForURL(/\/h5p\/edit\//);await f.locator('.content-type-buttons li.advancedtext').waitFor();await dump('04-native-reopened');report.steps.push('Actual browser download reimported into native editor');
 await f.locator('.nodetree .draggable-wrapper').first().dblclick();
 await f.locator('.editor-overlay-semantics .field-name-text [contenteditable=true]').first().click();
 await f.locator('.editor-overlay-semantics .ck-editor__editable').fill('NATIVE GATE EDITED');
 await f.locator('.editor-overlay-header button.button-blue').click();
 await page.locator('#save-h5p').click();await page.waitForURL(/\/h5p\/play\//);
 const editedId=page.url().split('/').at(-1);
 await dump('05-native-edited-player');
 await page.waitForFunction(()=>document.querySelector('.h5p-branching-scenario,iframe.h5p-iframe'));
 const play=await page.locator('iframe.h5p-iframe').count()?page.frameLocator('iframe.h5p-iframe'):page;
 await play.locator('.h5p-start-button').click();
 await stableVisible(play.getByText('NATIVE GATE EDITED',{exact:true}));await dump('06-native-edited-replay');
 report.steps.push('Imported native text edited in upstream editor, saved and visibly replayed');
 const secondDownload=page.waitForEvent('download');await page.goto(`http://127.0.0.1:8080/export/${editedId}`).catch(e=>{if(!/Download is starting/.test(e.message))throw e});
 const second=await secondDownload;const roundtrip=path.join(out,'native-roundtrip.h5p');await second.saveAs(roundtrip);
 const z2=await JSZip.loadAsync(await fs.readFile(roundtrip));const p2=JSON.parse(await z2.file('content/content.json').async('string'));assert(p2.branchingScenario.content[0].type.params.text.includes('NATIVE GATE EDITED'));
 report.steps.push('Actual second .h5p download preserves the edit');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.external,[]);report.complete=true;report.offlineBoundary='CSP and browser routing block optional remote help; no external responses permitted. Only in-memory native-editor tour preferences are kept; player is anonymous and learner data disabled.';report.note='Single-node feasibility only. Three-module authoring, merged edit/save/replay and full product verification remain required.';
}catch(e){report.failure=e.stack;await dump('failure').catch(()=>{});throw e;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(out,'browser-command.json'),JSON.stringify(command,null,2));await fs.writeFile(path.join(out,'server.log'),logs);await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();server.kill('SIGTERM');}
