import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import JSZip from 'jszip';
import path from 'node:path';
import {context,user,runtime} from './context.mjs';
const profile=JSON.parse(await readFile('native/profile.json'));
await mkdir('native/cache',{recursive:true});
for(const [name,local] of [['core','core.zip'],['editor','editor.zip'],['libraries','branching-current.h5p'],['supplementalLibraries','interactive-video.h5p']]){
 const out=path.resolve('native/cache',local);
 let bytes;try{bytes=await readFile(out)}catch{}
 if(!bytes){execFileSync('curl',['-L','--fail','--retry','2','--max-time','180',profile[name].url,'-o',out],{stdio:'inherit'});bytes=await readFile(out)}
 const hash=createHash('sha256').update(bytes).digest('hex');
 if(hash!==profile[name].sha256) throw new Error(`${name} official download changed: expected ${profile[name].sha256}, found ${hash}. Stop and review profile; no silent upgrade.`);
 if(name==='core'||name==='editor'){
  const z=await JSZip.loadAsync(bytes);for(const entry of Object.values(z.files)){if(entry.dir)continue;const relative=entry.name.split('/').slice(1).join('/');if(!relative)continue;if(relative.split('/').includes('..'))throw Error('Unsafe archive');const target=path.join(runtime,name,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,await entry.async('nodebuffer'));}
 }
}
const {editor,config}=await context();
if(config.coreApiVersion.minor!==27)throw Error('Published server core profile changed');
const closure={};
let installed=0;
for(const filename of ['branching-current.h5p','interactive-video.h5p']){
 const result=await editor.uploadPackage(path.resolve('native/cache',filename),user,{onlyInstallLibraries:true});installed+=result.installedLibraries.length;
 const z=await JSZip.loadAsync(await readFile(path.resolve('native/cache',filename)));
 for(const n of Object.keys(z.files).filter(x=>x.endsWith('/library.json'))){
  const m=JSON.parse(await z.file(n).async('string'));if((m.coreApi?.minorVersion??0)>27)throw Error('Incompatible upstream core requirement');
  const folder=n.split('/')[0];const files={};
  for(const p of Object.keys(z.files).filter(x=>x.startsWith(folder+'/')&&!z.files[x].dir))files[p.slice(folder.length+1)]=createHash('sha256').update(await z.file(p).async('nodebuffer')).digest('hex');
  if(closure[folder]&&JSON.stringify(closure[folder])!==JSON.stringify({metadata:m,files}))throw Error('Official bundles have conflicting library bytes: '+folder);
  closure[folder]={metadata:m,files};
 }
}
for(const [name,item]of Object.entries(closure)){
 for(const kind of ['preloadedDependencies','editorDependencies','dynamicDependencies'])for(const dep of item.metadata[kind]??[]){
  const target=dep.machineName+'-'+dep.majorVersion+'.'+dep.minorVersion;
  if(!closure[target])throw Error('Incomplete native dependency closure: '+name+' -> '+target);
 }
}
await writeFile('native/library-profile.json',JSON.stringify(closure,null,2)+'\n');
const data=await editor.getLibraryData('H5P.BranchingScenario','1','8','en');
if(!data.javascript.some(p=>p.includes('H5PEditor.BranchingScenario')))throw Error('Missing native editor assets');
await mkdir('artifacts/native-setup',{recursive:true});
await writeFile('artifacts/native-setup/report.json',JSON.stringify({core:config.coreApiVersion,libraries:Object.keys(closure).length,completeDependencyClosure:true,editorAssetsResolved:true,scripts:data.javascript.length,styles:data.css.length},null,2)+'\n');
console.log('Official dependency closure checked: '+Object.keys(closure).length+' libraries, Core1.27, native editor assets resolved.');
