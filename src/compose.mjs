import {sha256,writeArchive} from './archive.mjs';
const enc=new TextEncoder();
const RECEIPT_LIMIT=8*1024*1024;
const jsonBytes=x=>enc.encode(JSON.stringify(x)).length;
export class ComposeError extends Error{constructor(code,message,detail={}){super(message);this.name='ComposeError';this.code=code;this.detail=detail}}
const fail=(code,message,detail)=>{throw new ComposeError(code,message,detail)};
const copy=x=>structuredClone(x);
const canonical=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const equalBytes=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const hasFeedback=f=>!!f&&(!!f.title||!!f.subtitle||!!f.image||Object.hasOwn(f,'endScreenScore'));
const isQuestion=n=>n.type.library==='H5P.BranchingQuestion 1.0';
const plain=s=>String(s??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
const short=s=>Array.from(plain(s)).slice(0,80).join('');
const pointer=p=>'/'+p.map(x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1')).join('/');
const at=(o,p)=>p.reduce((x,k)=>x?.[k],o);
const exitKey=(m,n,a)=>`${m}:${n}:${a===null?'node':a}`;
function edges(node){return isQuestion(node)?node.type.params.branchingQuestion.alternatives.map((a,i)=>({target:a.nextContentId,alternative:i,label:a.text,feedback:a.feedback})): [{target:node.nextContentId,alternative:null,label:null,feedback:node.feedback}]}
export function eligibleExits(modules){const out=[];for(const m of modules){for(const [i,n]of m.params.branchingScenario.content.entries())for(const e of edges(n))if(e.target===-1)out.push({moduleId:m.id,node:i,alternative:e.alternative,label:e.alternative===null?short(n.type.params.text??n.type.params.alt??n.type.metadata?.title):short(e.label),blockedReason:hasFeedback(e.feedback)?'CUSTOM_FEEDBACK':null});}return out}
function graph(nodes){
 const n=nodes.length;if(n<1||n>60)fail('NODE_LIMIT','The combined graph must contain 1–60 nodes.');
 const adjacency=nodes.map((node,i)=>{const es=edges(node);if(!es.length)fail('EMPTY_CHOICES','A question needs alternatives.',{node:i});for(const e of es)if(!Number.isInteger(e.target)||e.target< -1||e.target>=n)fail('INVALID_TARGET','A route target is outside the content array.',{node:i,target:e.target});return es});
 const colors=new Uint8Array(n),seen=new Set(),memo=new Map();
 function visit(i){if(colors[i]===1)fail('CYCLE','The selected connections create a cycle.',{node:i});if(colors[i]===2)return memo.get(i);colors[i]=1;seen.add(i);let count=0,receiptBytes=0;for(const e of adjacency[i]){const child=e.target===-1?{count:1,receiptBytes:512+2*jsonBytes(e.feedback??{})}:visit(e.target);count+=child.count;receiptBytes+=child.receiptBytes+child.count*(96+2*jsonBytes(e.label));if(count>512)fail('ROUTE_LIMIT','The combined graph exceeds 512 complete routes.');if(receiptBytes>RECEIPT_LIMIT)fail('RECEIPT_LIMIT','Repeated labels or feedback exceed the 8 MiB receipt budget.');}colors[i]=2;const result={count,receiptBytes};memo.set(i,result);return result}
 visit(0);if(seen.size!==n)fail('UNREACHABLE','Every module and node must be reachable from the host entry.',{nodes:nodes.map((_,i)=>i).filter(i=>!seen.has(i))});
 const routes=[];function walk(i,path,choices){const p=[...path,i];for(const e of adjacency[i]){const c=e.alternative===null?choices:[...choices,{node:i,alternative:e.alternative,label:e.label}];if(e.target===-1)routes.push({nodes:p,choices:c,ending:{node:i,alternative:e.alternative,customFeedback:hasFeedback(e.feedback),feedback:copy(e.feedback??{})}});else walk(e.target,p,c)}}walk(0,[],[]);return {routes,receiptBytes:memo.get(0).receiptBytes};
}
function checkGlobals(modules){
 const host=modules[0],s=host.params.branchingScenario;
 const packageGlobals=h=>{const x=copy(h);delete x.title;delete x.extraTitle;delete x.preloadedDependencies;delete x.editorDependencies;delete x.dynamicDependencies;return x};
 const scenarioGlobals=x=>{const z=copy(x);delete z.content;delete z.startScreen;delete z.title;return z};
 for(const donor of modules.slice(1)){
  const d=donor.params.branchingScenario;
  if(Object.values(d.startScreen??{}).some(v=>v!==''&&v!==null&&v!==undefined))fail('DONOR_START','Donor start screens must be empty. The host opening is retained.',{module:donor.id});
  if(canonical(scenarioGlobals(s))!==canonical(scenarioGlobals(d)))fail('GLOBAL_SETTINGS','Default ending, localization and behavior must match exactly.',{module:donor.id});
  if(canonical(packageGlobals(host.h5p))!==canonical(packageGlobals(donor.h5p)))fail('PACKAGE_METADATA','Package-level metadata must match apart from title and dependency lists; rights metadata is never silently replaced.',{module:donor.id});
  for(const ref of donor.typedImageRefs.filter(r=>r.pointer[1]!=='content')){const h=at(host.params,ref.pointer);if(!h||host.assets.get(h.path)?.sha256!==donor.assets.get(ref.path)?.sha256)fail('GLOBAL_IMAGE','The shared ending must use identical image bytes.',{module:donor.id,pointer:pointer(ref.pointer)});}
 }
}
export async function compose(modules,connections=[],options={}){
 if(!Array.isArray(modules)||modules.length<2||modules.length>5)fail('MODULE_COUNT','Choose 2–5 compatible H5P modules.');
 if(new Set(modules.map(m=>m.id)).size!==modules.length||modules.some(m=>!/^[A-Za-z0-9_-]{1,32}$/.test(m.id)||['__proto__','prototype','constructor'].includes(m.id)))fail('MODULE_ID','Module identifiers must be unique.');
 if(modules.reduce((s,m)=>s+m.sizeBytes,0)>64*1024*1024)fail('INPUT_LIMIT','Combined compressed input must not exceed 64 MiB.');
 const nodeCount=modules.reduce((s,m)=>s+m.params.branchingScenario.content.length,0);if(nodeCount>60)fail('NODE_LIMIT','The combined graph exceeds 60 nodes.');
 checkGlobals(modules);
 const host=modules[0],params=copy(host.params),h5p=copy(host.h5p),files=new Map(),nodes=[],moduleOffsets={},nodeMappings=[],assetMappings=[],assetDestinations=new Map(),usedPaths=new Map();
 const oldIds=new Set(),usedIds=new Set();for(const m of modules){const seen=new Set();for(const n of m.params.branchingScenario.content){const id=n.type.subContentId;if(!id||seen.has(id.toLowerCase()))fail('DUPLICATE_ID','An input has missing or duplicate subContentIds.',{module:m.id});seen.add(id.toLowerCase());oldIds.add(id.toLowerCase());}if(m===host)for(const id of seen)usedIds.add(id);}
 const makeUuid=options.makeUuid??(()=>crypto.randomUUID());
 function fresh(){for(let i=0;i<32;i++){const id=makeUuid();if(typeof id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))fail('UUID','The UUID generator returned an invalid identifier.');if(!oldIds.has(id.toLowerCase())&&!usedIds.has(id.toLowerCase())){usedIds.add(id.toLowerCase());return id}}fail('UUID','Could not allocate a fresh donor identifier.')}
 for(const m of modules){
  const offset=nodes.length;moduleOffsets[m.id]=offset;
  for(const [i,source]of m.params.branchingScenario.content.entries()){
   const n=copy(source);if(isQuestion(n)){for(const a of n.type.params.branchingQuestion.alternatives)if(a.nextContentId>=0)a.nextContentId+=offset;}else if(n.nextContentId>=0)n.nextContentId+=offset;
   const old=n.type.subContentId;if(m!==host)n.type.subContentId=fresh();
   nodes.push(n);nodeMappings.push({moduleId:m.id,sourceNode:i,outputNode:offset+i,library:n.type.library,oldSubContentId:old,newSubContentId:n.type.subContentId,regenerated:m!==host,sourceNodeSha256:await sha256(enc.encode(canonical(source)))});
  }
  for(const [path,bytes]of m.files){if(path==='h5p.json'||path.startsWith('content/'))continue;const present=files.get(path);if(present&&!equalBytes(present,bytes))fail('LIBRARY_CONFLICT','The same library path has conflicting bytes. Re-export modules from the same profile.',{module:m.id,path});if(!present)files.set(path,bytes);}
  const map=new Map();
  for(const [sourcePath,a]of m.assets){
   const digest=await sha256(a.bytes);if(digest!==a.sha256)fail('ASSET_CHANGED','An input image changed after validation.',{module:m.id,path:sourcePath});
   let dest=sourcePath,reason='unchanged';const existing=usedPaths.get(dest.toLowerCase());
   if(existing){if(existing.sha256===digest){dest=existing.path;reason=dest===sourcePath?'shared-identical-bytes':'case-alias-identical-bytes'}else{
     const ext=sourcePath.split('.').at(-1).toLowerCase();dest=`images/branchsplice-${m.id.toLowerCase()}-${digest.slice(0,24)}.${ext}`;reason='collision-renamed';let suffix=1;while(usedPaths.has(dest.toLowerCase())&&usedPaths.get(dest.toLowerCase()).sha256!==digest)dest=`images/branchsplice-${m.id.toLowerCase()}-${digest.slice(0,24)}-${suffix++}.${ext}`;
   }}
   if(m===host&&dest!==sourcePath)fail('HOST_ASSET_ALIAS','Host image paths must be unambiguous.');
   map.set(sourcePath,dest);usedPaths.set(dest.toLowerCase(),{path:dest,sha256:digest});files.set('content/'+dest,a.bytes);
   assetMappings.push({moduleId:m.id,sourcePath,outputPath:dest,sha256:digest,mime:a.mime,width:a.width,height:a.height,renamed:dest!==sourcePath,reason,references:m.typedImageRefs.filter(r=>r.path===sourcePath).map(r=>({sourcePointer:pointer([...r.pointer,'path']),outputPointer:pointer([...r.pointer.map((v,i)=>i===2&&r.pointer[1]==='content'?v+offset:v),'path'])}))});
  }
  assetDestinations.set(m.id,map);
 }
 params.branchingScenario.content=nodes;
 for(const m of modules.slice(1))for(const r of m.typedImageRefs){if(r.pointer[1]!=='content')continue;const p=r.pointer.map((v,i)=>i===2?v+moduleOffsets[m.id]:v),descriptor=at(params,p),dest=assetDestinations.get(m.id).get(r.path);if(!descriptor||!dest)fail('IMAGE_REFERENCE','A typed image reference could not be mapped.',{module:m.id,pointer:pointer(p)});descriptor.path=dest;}
 const byId=new Map(modules.map(m=>[m.id,m])),seenExits=new Set(),resolved=[];
 if(!Array.isArray(connections)||connections.length>4096)fail('CONNECTIONS','Invalid connection list.');
 for(const c of connections){
  if(!c||Object.keys(c).some(k=>!['fromModule','fromNode','alternative','toModule'].includes(k)))fail('CONNECTION','Unsupported connection fields.');
  const source=byId.get(c.fromModule),target=byId.get(c.toModule);if(!source||!target||target===host)fail('CONNECTION_TARGET','Connections must target a loaded donor entry.');
  if(!Number.isInteger(c.fromNode)||c.fromNode<0||c.fromNode>=source.params.branchingScenario.content.length)fail('CONNECTION_SOURCE','Unknown source node.');
  const n=source.params.branchingScenario.content[c.fromNode],a=c.alternative??null;let endpoint;
  if(isQuestion(n)){if(!Number.isInteger(a)||a<0||a>=n.type.params.branchingQuestion.alternatives.length)fail('CONNECTION_SOURCE','Select an exact branching alternative.');endpoint=n.type.params.branchingQuestion.alternatives[a];}else{if(a!==null)fail('CONNECTION_SOURCE','A regular node has no alternatives.');endpoint=n;}
  if(endpoint.nextContentId!==-1)fail('NOT_TERMINAL','Only terminal exits can be connected.');if(hasFeedback(endpoint.feedback))fail('CUSTOM_FEEDBACK','This exit has custom feedback and cannot be replaced.');
  const key=exitKey(c.fromModule,c.fromNode,a);if(seenExits.has(key))fail('DUPLICATE_CONNECTION','An exit can have only one destination.');seenExits.add(key);
  const globalSource=moduleOffsets[c.fromModule]+c.fromNode,globalTarget=moduleOffsets[c.toModule];const output=nodes[globalSource];if(isQuestion(output))output.type.params.branchingQuestion.alternatives[a].nextContentId=globalTarget;else output.nextContentId=globalTarget;
  resolved.push({fromModule:c.fromModule,fromNode:c.fromNode,alternative:a,toModule:c.toModule,toNode:0,outputFromNode:globalSource,outputToNode:globalTarget});
 }
 const {routes,receiptBytes}=graph(nodes);
 for(const category of ['preloadedDependencies','editorDependencies','dynamicDependencies']){
  const all=new Map();for(const m of modules)for(const d of m.h5p[category]??[]){const key=d.machineName;if(all.has(key)&&canonical(all.get(key))!==canonical(d))fail('DEPENDENCY_CONFLICT','Top-level library dependencies conflict.',{library:key});all.set(key,copy(d));}if(all.size)h5p[category]=[...all.values()];else delete h5p[category];
 }
 for(const row of nodeMappings)row.outputNodeSha256=await sha256(enc.encode(canonical(nodes[row.outputNode])));
 const summary={moduleCount:modules.length,nodeCount:nodes.length,routeCount:routes.length,assetCount:usedPaths.size,renamedAssetCount:assetMappings.filter(x=>x.renamed).length};
 const manifest={schemaVersion:1,tool:'BranchSplice',profile:'lumi-10.0.4-core-1.27-branching-scenario-1.8.14',scope:{noScore:true,acyclic:true,maximumNodes:60,maximumRoutes:512,maximumReceiptBytes:RECEIPT_LIMIT},inputs:modules.map(m=>({id:m.id,filename:m.filename,sha256:m.inputHash,sizeBytes:m.sizeBytes,title:m.h5p.title,nodeCount:m.params.branchingScenario.content.length,metadata:copy(m.h5p),...(m.origin?{origin:copy(m.origin)}:{})})),hostModule:host.id,retainedHostSettings:{startScreen:copy(host.params.branchingScenario.startScreen??{}),endScreens:copy(host.params.branchingScenario.endScreens),behaviour:copy(host.params.branchingScenario.behaviour),l10n:copy(host.params.branchingScenario.l10n),metadata:copy(host.h5p)},summary,moduleOffsets,nodeMappings,assetMappings,connections:resolved,routes,validation:{static:'passed',nativeConsumer:'Not run for this individual export. Consult the repository verification status for the pinned synthetic 4-route and 6-route cases.'}};
 const {routes:omittedRoutes,...baseReceipt}=manifest;if(jsonBytes(baseReceipt)+receiptBytes>RECEIPT_LIMIT)fail('RECEIPT_LIMIT','The composition exceeds the 8 MiB provenance receipt budget.');
 const packageBytes=enc.encode(JSON.stringify(h5p)),contentBytes=enc.encode(JSON.stringify(params));if(packageBytes.length>2*1024*1024||contentBytes.length>2*1024*1024)fail('CONTENT_LIMIT','Combined package/content JSON must remain within 2 MiB per entry.');files.set('h5p.json',packageBytes);files.set('content/content.json',contentBytes);
 return {h5p,params,files,manifest,summary,routes,moduleOffsets};
}
export async function exportResult(result){
 const bytes=await writeArchive(result.files);const digest=await sha256(bytes);const manifest=copy(result.manifest);manifest.output={filename:'branch-splice.h5p',sha256:digest,sizeBytes:bytes.length,contentJsonSha256:await sha256(result.files.get('content/content.json'))};
 const lines=['BranchSplice connection report',`Profile: ${manifest.profile}`,`Host: ${manifest.hostModule}`,`${result.summary.moduleCount} modules / ${result.summary.nodeCount} nodes / ${result.summary.routeCount} complete routes`,`${result.summary.assetCount} output image files / ${result.summary.renamedAssetCount} renamed source paths`,'','Input archives:',...manifest.inputs.map(i=>`${i.id}: ${i.filename}\n  SHA-256 ${i.sha256}`),'','Connections:',...manifest.connections.map(c=>`${c.fromModule} node ${c.fromNode}${c.alternative===null?'':` choice ${c.alternative+1}`} -> ${c.toModule} entry 0 (output ${c.outputFromNode} -> ${c.outputToNode})`),'','Asset mappings:',...manifest.assetMappings.map(a=>`${a.moduleId}: ${a.sourcePath} -> ${a.outputPath}\n  SHA-256 ${a.sha256} (${a.reason})`),'','Complete forward routes:',...manifest.routes.map((r,i)=>`${i+1}. ${r.nodes.join(' -> ')} -> END\n   Choices: ${r.choices.map(c=>c.label).join(' / ')||'(none)'}`),'',`Output SHA-256 ${digest}`,'Host opening and shared global settings retained. Node metadata and image bytes preserved; donor subContentIds regenerated.','Static validation is not a live native-player test of this individual export. No learner records or assessment data are created.'];
 const manifestText=JSON.stringify(manifest,null,2)+'\n',reportText=lines.join('\n')+'\n';if(enc.encode(manifestText).length+enc.encode(reportText).length>RECEIPT_LIMIT)fail('RECEIPT_LIMIT','The final manifest and report exceed the 8 MiB receipt budget.');
 return {h5p:bytes,manifestText,reportText};
}
