/** Native upstream-editor authoring, no product merger helpers or seeded graph JSON. */
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';
const expected=JSON.parse(await fs.readFile('oracle/expected-manifest.json'));
const out=path.resolve('artifacts/native-fixtures');await fs.mkdir(out,{recursive:true});
const server=spawn(process.execPath,['native/server.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:'8080'}});let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8080/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});const cdp=await browser.newBrowserCDPSession();const command=await cdp.send('Browser.getBrowserCommandLine');assert(!command.arguments.some(x=>['--no-sandbox','--disable-setuid-sandbox'].includes(x)));
const context=await browser.newContext({viewport:{width:1600,height:1200},acceptDownloads:true});await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();page.setDefaultTimeout(20000);
const report={status:'RUNNING',steps:[],modules:[],pageErrors:[],externalRequests:[],blockedExternalRequests:[],attemptedExternalRequests:[],note:'Only public upstream native editor widgets and visible field controls author content. No merge engine is imported.'};
page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('request',r=>{if(!/^(http:\/\/127\.0\.0\.1:8080|data:|blob:|about:)/.test(r.url()))report.attemptedExternalRequests.push(r.url())});
await context.route('**/*',route=>{const url=route.request().url();if(/^(http:\/\/127\.0\.0\.1:8080|data:|blob:|about:)/.test(url))return route.continue();report.blockedExternalRequests.push(url);return route.abort('blockedbyclient')});
page.on('response',r=>{if(!r.url().startsWith('http://127.0.0.1:8080'))report.externalRequests.push(r.url())});
const f=page.frameLocator('iframe.h5p-editor-iframe');
async function dump(name){await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});for(const[i,frame]of page.frames().entries())await fs.writeFile(path.join(out,name+`-frame${i}.html`),await frame.content());}
async function expandAncestors(target){
 const groups=target.locator('xpath=ancestor::fieldset[contains(@class,"group")]');
 for(let i=0;i<await groups.count();i++){const title=groups.nth(i).locator(':scope > .title');if(await title.count()&&await title.getAttribute('aria-expanded')==='false')await title.click();}
}
async function stableVisible(target){
 await target.waitFor();let previous=null,stable=0;
 for(let n=0;n<80;n++){const b=await target.boundingBox();const v=page.viewportSize();if(b&&b.x>=0&&b.y>=0&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1&&previous&&['x','y','width','height'].every(k=>Math.abs(b[k]-previous[k])<0.25))stable++;else stable=0;if(stable>=3)return;previous=b;await page.waitForTimeout(100);}throw Error('Native screen did not become stable and fully visible');
}
async function rich(selector,html){
 const field=f.locator(selector);await expandAncestors(field);await field.locator('[contenteditable=true]').first().click();
 await page.waitForFunction(()=>window.nativeEditor?.iframeWindow?.H5PEditor?.Html?.current?.ckeditor);
 // CKEditor's public setData API writes the native rich-text field, never routing parameters.
 await page.evaluate(html=>window.nativeEditor.iframeWindow.H5PEditor.Html.current.ckeditor.setData(html),html);
 assert.equal(await page.evaluate(()=>window.nativeEditor.iframeWindow.H5PEditor.Html.current.ckeditor.getData()),html);
 await page.locator('#save-h5p').focus();
}
async function chooseDrop(position){
 const nodes=f.locator('.dropzone');let candidates=[];for(let i=0;i<await nodes.count();i++){const b=await nodes.nth(i).boundingBox();if(b)candidates.push({i,...b});}
 assert(candidates.length,'No native dropzone');
 candidates.sort(position==='left'?(a,b)=>a.x-b.x:position==='right'?(a,b)=>b.x-a.x:(a,b)=>b.y-a.y);
 await nodes.nth(candidates[0].i).click();
}
async function add(kind,position,token){
 const tour=f.getByRole('button',{name:'I got it',exact:true});if(await tour.isVisible())await tour.click();
 await f.locator(`.content-type-buttons li.${kind==='text'?'advancedtext':kind}`).click();await chooseDrop(position);await f.locator('.editor-overlay').waitFor();
 const v=expected.node_content[token];
 if(kind==='text')await rich('.editor-overlay-semantics .field-name-text',v.text);
 if(kind==='branchingquestion'){
  await rich('.editor-overlay-semantics .field-name-question',v.question);
  const inputs=f.locator('.editor-overlay-semantics .field-name-alternatives .field-name-text input');assert.equal(await inputs.count(),2);
  for(let i=0;i<2;i++){await expandAncestors(inputs.nth(i));await inputs.nth(i).fill(v.choices[i]);}
 }
 if(kind==='image'){
  const picker=page.waitForEvent('filechooser');await f.locator('.editor-overlay-semantics .field-name-file .add').click();await(await picker).setFiles(`fixtures/${v.image}/map.png`);
  await f.locator('.editor-overlay-semantics .field-name-file .thumbnail img').waitFor();await f.locator('.editor-overlay-semantics .field-name-alt input').fill(v.alt);
 }
 await f.locator('.editor-overlay-header button.button-blue').click();await f.locator('.editor-overlay').waitFor({state:'hidden'});report.steps.push(`Native node ${token} authored`);
}
async function settings(module){
 await f.locator('.bs-editor-settings-tab').click();
 await rich('#settings .field-name-endScreenTitle',expected.ending.title);
 await rich('#settings .field-name-endScreenSubtitle',expected.ending.subtitle);
 if(module==='A'){
  await rich('#settings .field-name-startScreenTitle','<p>Event staff orientation</p>');
  await rich('#settings .field-name-startScreenSubtitle','<p>Choose the task you need today.</p>');
 }
 await f.locator('.bs-editor-content-tab').click();
}
async function download(id,name){const event=page.waitForEvent('download');await page.getByRole('link',{name:'Download',exact:true}).click();const d=await event;const p=path.join(out,name);await d.saveAs(p);return p;}
async function replayModule(id,module){
 const routes=module==='A'?[[0,1,2],[0,1,3]]:[[0,1,2],[0,1,3]];
 for(let routeIndex=0;routeIndex<routes.length;routeIndex++){
  await page.goto(`http://127.0.0.1:8080/h5p/play/${id}`);
  await page.waitForFunction(()=>document.querySelector('.h5p-branching-scenario,iframe.h5p-iframe'));
  const view=await page.locator('iframe.h5p-iframe').count()?page.frameLocator('iframe.h5p-iframe'):page;
  await view.locator('.h5p-start-button').click();
  for(const index of routes[routeIndex]){
   const node=expected.node_content[module+index];
   if(node.text){const token=node.text.match(/<p>(.*?)<\/p>/)?.[1]??node.text;const text=view.locator('.h5p-advanced-text').filter({hasText:token}).first();await stableVisible(text);assert.equal(await text.innerHTML(),node.text);await view.locator('.h5p-proceed-button:visible').click();}
   else if(node.image){const image=view.locator(`img[alt="${node.alt}"]:visible`);await stableVisible(image);const data=await image.evaluate(async img=>({width:img.naturalWidth,height:img.naturalHeight,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(img.src)).arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('')}));assert.equal(data.width,96);assert.equal(data.height,64);assert.equal(data.hash,expected.images[node.image].sha256);await dump(`module-${module}-route${routeIndex}-map`);await view.locator('.h5p-proceed-button:visible').click();}
   else{const q=view.locator('.h5p-branching-question-title:visible');await stableVisible(q);assert.equal(await q.innerHTML(),node.question);await view.getByText(node.choices[routeIndex],{exact:true}).click();}
  }
  const ending=view.locator('.h5p-end-screen.h5p-current-screen .h5p-branching-scenario-title-text');await stableVisible(ending);assert.equal(await ending.innerHTML(),expected.ending.title);await dump(`module-${module}-route${routeIndex}-ending`);report.steps.push(`Native module ${module} route ${routeIndex+1} replayed with exact screens and image bytes`);
 }
}
try{
 for(const module of ['A','B','C']){
  await page.goto('http://127.0.0.1:8080/h5p/new');await f.locator('.content-type-buttons li.advancedtext').waitFor();if(module==='A'){await f.getByRole('button',{name:'I got it',exact:true}).click();await f.locator('.tour-button').waitFor({state:'hidden'});}await f.locator('.field-name-extraTitle input:visible').first().fill(`BranchSplice module ${module}`);
  await add(module==='A'?'text':'image','bottom',module+'0');await add('branchingquestion','bottom',module+'1');await add('text','left',module+'2');await add('text','right',module+'3');await settings(module);await dump(`module-${module}-authored`);
  const before=await page.evaluate(()=>window.nativeEditor.getParams());await fs.writeFile(path.join(out,`module-${module}-native-fields.json`),JSON.stringify(before,null,2));
  await page.locator('#save-h5p').click();await page.waitForURL(/\/h5p\/play\//);const id=page.url().split('/').at(-1);const original=await download(id,`module-${module}-native.h5p`);
  const bytes=await fs.readFile(original);const z=await JSZip.loadAsync(bytes);const parameters=JSON.parse(await z.file('content/content.json').async('string'));assert.equal(parameters.branchingScenario.content.length,4);
  // Normalize only the synthetic donor image packaging name after native export.
  // This deliberate collision is subsequently reimported and native-saved before use.
  let collidingPath=null;
  if(module!=='A'){
   const img=parameters.branchingScenario.content[0].type.params.file;const old='content/'+img.path;const b=await z.file(old).async('nodebuffer');assert.equal(createHash('sha256').update(b).digest('hex'),expected.images[module==='B'?'registration':'room'].sha256);
   z.remove(old);z.file('content/images/map.png',b);img.path='images/map.png';z.file('content/content.json',JSON.stringify(parameters));collidingPath=path.join(out,`module-${module}-collision.h5p`);await fs.writeFile(collidingPath,await z.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  }
  const input=collidingPath??original;
  await page.goto('http://127.0.0.1:8080/');await page.locator('input[type=file]').setInputFiles(input);await page.getByRole('button',{name:'Import',exact:true}).click();await page.waitForURL(/\/h5p\/edit\//);await f.locator('.content-type-buttons li.advancedtext').waitFor();await dump(`module-${module}-reimported`);
  await page.locator('#save-h5p').click();await page.waitForURL(/\/h5p\/play\//);const roundtripId=page.url().split('/').at(-1);const saved=await download(roundtripId,`module-${module}-native-roundtrip.h5p`);
  await replayModule(roundtripId,module);
  const final=await JSZip.loadAsync(await fs.readFile(saved));const p=JSON.parse(await final.file('content/content.json').async('string'));if(module!=='A'){const ref=p.branchingScenario.content[0].type.params.file.path;const pixels=await final.file('content/'+ref).async('nodebuffer');assert.equal(createHash('sha256').update(pixels).digest('hex'),expected.images[module==='B'?'registration':'room'].sha256);}
  const fixture=path.join(out,`module-${module}.h5p`);if(collidingPath)await fs.rename(input,fixture);else await fs.copyFile(input,fixture);
  report.modules.push({module,original:path.basename(original),fixture:path.basename(fixture),nativeRoundtrip:path.basename(saved),packagingCollision:collidingPath?path.basename(fixture):null,fixtureSha256:createHash('sha256').update(await fs.readFile(fixture)).digest('hex'),roundtripSha256:createHash('sha256').update(await fs.readFile(saved)).digest('hex'),nodes:p.branchingScenario.content.length});
 }
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.error=e.stack;await dump('failure').catch(()=>{});throw e;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(out,'server.log'),logs);await fs.writeFile(path.join(out,'browser-command.json'),JSON.stringify(command,null,2));await context.tracing.stop({path:path.join(out,'trace.zip')});await browser.close();server.kill('SIGTERM');}
