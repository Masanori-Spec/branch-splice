// Reconstructs private evidence locally from official packages and sanitized hashes.
import fs from 'node:fs/promises';import path from 'node:path';import{createHash}from'node:crypto';import{writeArchive}from'../src/archive.mjs';
const[input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/reconstruct-evidence.mjs sanitized.json private-output.h5p');
const evidence=JSON.parse(await fs.readFile(input)),profile=JSON.parse(await fs.readFile('native/library-profile.json')),hash=b=>createHash('sha256').update(b).digest('hex');
if(evidence.kind!=='sanitized-actual-download-evidence'||evidence.oracle?.status!=='PASS')throw Error('Not verified sanitized fixture evidence');
const maps=new Map();for(const folder of ['registration','room']){const b=await fs.readFile(`fixtures/${folder}/map.png`);maps.set(hash(b),b)}
const files=new Map();for(const entry of evidence.entries){let b;
 if(evidence.authoredEntries[entry.path])b=Buffer.from(evidence.authoredEntries[entry.path].utf8);
 else if(entry.path.startsWith('content/'))b=maps.get(entry.sha256);
 else{const slash=entry.path.indexOf('/'),folder=entry.path.slice(0,slash),relative=entry.path.slice(slash+1);if(!profile[folder]?.files[relative])throw Error('Unknown official file: '+entry.path);b=await fs.readFile(path.join('native/runtime/libraries',folder,relative));if(hash(b)!==entry.sha256&&relative==='library.json')b=Buffer.from(JSON.stringify(profile[folder].metadata));}
 if(!b||b.length!==entry.bytes||hash(b)!==entry.sha256)throw Error('Exact entry cannot be reconstructed: '+entry.path);files.set(entry.path,new Uint8Array(b));
}
const rebuilt=await writeArchive(files);await fs.writeFile(output,rebuilt);console.log(JSON.stringify({status:'PASS',fileEntries:files.size,actualDownloadedArchiveSha256:evidence.actualArchiveSha256,reconstructedArchiveSha256:hash(rebuilt),note:'Every file entry is exact. Repacked ZIP container bytes may differ.'},null,2));
