import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
const base='http://127.0.0.1:18081';
test('Local native harness boundaries and ephemeral editor preferences',async t=>{
 const child=spawn(process.execPath,['native/server.mjs'],{env:{...process.env,PORT:'18081'},stdio:['ignore','pipe','pipe']});let log='';child.stderr.on('data',b=>log+=b);child.stdout.on('data',b=>log+=b);
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready,log);
  await t.test('Correct published Core profile and same-origin CSP',async()=>{const r=await fetch(base+'/health');assert.equal(r.status,200);assert.deepEqual((await r.json()).core,{major:1,minor:27});const csp=r.headers.get('content-security-policy');assert(csp.includes("frame-src 'self'"));assert(csp.includes("connect-src 'self'"));assert(csp.includes("object-src 'none'"));});
  await t.test('Reject untrusted Host',async()=>{const status=await new Promise((resolve,reject)=>{http.get(base+'/health',{headers:{Host:'example.invalid'}},r=>{r.resume();resolve(r.statusCode)}).on('error',reject)});assert.equal(status,403)});
  await t.test('Reject untrusted Origin',async()=>{assert.equal((await fetch(base+'/health',{headers:{Origin:'https://example.invalid'}})).status,403)});
  await t.test('Offline catalog has four valid empty arrays',async()=>{const r=await fetch(base+'/h5p/ajax?action=content-hub-metadata-cache');assert.equal(r.status,200);assert.deepEqual(await r.json(),{data:{levels:[],languages:[],licenses:[],disciplines:[]},success:true})});
  await t.test('Only an editor onboarding preference is stored in memory',async()=>{const url=base+'/h5p/contentUserData/0/h5p-editor-branching-scenario-tour-v1-seen/0';assert.deepEqual(await(await fetch(url)).json(),{success:true,data:false});assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data=true'})).status,200);assert.deepEqual(await(await fetch(url)).json(),{success:true,data:'true'})});
  await t.test('Learner state is not available',async()=>{assert.equal((await fetch(base+'/h5p/contentUserData/0/state/0')).status,403)});
  await t.test('Native editor full dependency route resolves',async()=>{const r=await fetch(base+'/h5p/ajax?action=libraries&machineName=H5P.BranchingScenario&majorVersion=1&minorVersion=8&language=en');assert.equal(r.status,200);const d=await r.json();assert(d.javascript.some(p=>p.includes('H5PEditor.BranchingScenario')))});
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
});
