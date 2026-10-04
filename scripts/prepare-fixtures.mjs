// Builds private test inputs from official packages already acquired by native:setup.
// Public sources contain only our authored JSON, PNGs, and hashes, not library bytes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writeArchive,readModule} from '../src/archive.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const profile=JSON.parse(await fs.readFile('native/library-profile.json'));
const provenance=JSON.parse(await fs.readFile('fixtures/h5p/provenance.json'));
const shared=new Map();
for(const[folder,item]of Object.entries(profile)){
 if(folder==='H5P.Table-1.1')continue; // unused by the accepted native export closure
 for(const[relative,expectedHash]of Object.entries(item.files)){
  const original=await fs.readFile(path.join('native/runtime/libraries',folder,relative));
  const compact=relative==='library.json'?Buffer.from(JSON.stringify(item.metadata)):null;
  if(hash(original)!==expectedHash&&!(compact&&hash(original)===hash(compact)))throw Error('Official library bytes differ: '+folder+'/'+relative);
  // The upstream native exporter serializes metadata compactly, without edits.
  shared.set(`${folder}/${relative}`,compact??new Uint8Array(original));
 }
}
const report={method:provenance.reconstruction.method,verifiedNativeAuthoringRun:provenance.verifiedRun,modules:{}};
for(const c of ['A','B','C']){
 const files=new Map(shared),pin=provenance.reconstruction.entrySets[c];
 const metadata=await fs.readFile(`fixtures/authored/module-${c}.metadata.json`),content=await fs.readFile(`fixtures/authored/module-${c}.content.json`);
 if(hash(metadata)!==pin.metadataJsonSha256||hash(content)!==pin.contentJsonSha256)throw Error('Authored fixture JSON changed: '+c);
 files.set('h5p.json',new Uint8Array(metadata));files.set('content/content.json',new Uint8Array(content));
 if(c!=='A')files.set('content/images/map.png',new Uint8Array(await fs.readFile(`fixtures/${c==='B'?'registration':'room'}/map.png`)));
 const entries=[...files].map(([n,b])=>[n,hash(b)]).sort(([a],[b])=>a.localeCompare(b));
 if(files.size!==pin.files||hash(JSON.stringify(entries))!==pin.sha256)throw Error('Reconstructed native entry bytes differ: '+c);
 const bytes=await writeArchive(files);await readModule(bytes,{id:c,filename:`module-${c}.h5p`});
 await fs.writeFile(`fixtures/h5p/module-${c}.h5p`,bytes);
 report.modules[c]={canonicalNativeArchiveSha256:provenance.modules[c],fileEntrySetSha256:pin.sha256,reconstructedArchiveSha256:hash(bytes),bytes:bytes.length,entryCount:files.size};
}
await fs.mkdir('generated',{recursive:true});await fs.writeFile('generated/fixture-reconstruction.json',JSON.stringify(report,null,2)+'\n');console.log('Private fixtures reconstructed; every file entry matches the accepted native originals');
