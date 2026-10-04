import test from 'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import{execFileSync}from'node:child_process';import{Script}from'node:vm';import{parse}from'parse5';
test('Built standalone HTML preserves minifier dollar sequences and has only parseable inline scripts',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'pipe'});
 const html=await fs.readFile('dist/index.html','utf8'),scripts=[],pending=[parse(html)];
 while(pending.length){const node=pending.pop();if(node.tagName==='script')scripts.push(node);pending.push(...(node.childNodes??[]));}
 assert.equal(scripts.length,2);assert(!html.includes('<script type="module" src="./app.mjs"></script>'));assert(!html.includes('href="./styles.css"'));
 for(const node of scripts){assert(!node.attrs.some(a=>a.name==='src'));new Script(node.childNodes.map(c=>c.value??'').join(''));}
 const context={};const workerHolder=scripts.find(n=>n.childNodes.some(c=>(c.value??'').startsWith('globalThis.__BRANCHSPLICE_WORKER__=')));assert(workerHolder);
 new Script(workerHolder.childNodes.map(c=>c.value??'').join('')).runInNewContext(context);assert.equal(typeof context.__BRANCHSPLICE_WORKER__,'string');new Script(context.__BRANCHSPLICE_WORKER__);
 assert(html.includes("connect-src 'none'"));assert(html.length<1000000);assert(!html.includes('lossless-native-fixture-repack'));
});
