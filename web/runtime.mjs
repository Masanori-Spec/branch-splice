import {eligibleExits} from '../src/compose.mjs';
export {eligibleExits};
let worker=null,url=null,serial=0;const pending=new Map();
function abortError(){const e=new Error('Operation cancelled');e.name='AbortError';e.code='CANCELLED';return e}
export function cancelOperations(){if(worker)worker.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null;for(const p of pending.values())p.reject(abortError());pending.clear()}
function ensure(){if(worker)return worker;if(typeof globalThis.__BRANCHSPLICE_WORKER__!=='string')throw Error('The standalone worker bundle is missing. Run npm run build.');url=URL.createObjectURL(new Blob([globalThis.__BRANCHSPLICE_WORKER__],{type:'text/javascript'}));worker=new Worker(url);worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);if(e.data.error){const error=Object.assign(new Error(e.data.error.message),e.data.error);p.reject(error)}else p.resolve(e.data.result)};worker.onerror=e=>{const error=new Error(e.message||'Worker failed');for(const p of pending.values())p.reject(error);pending.clear();worker?.terminate();worker=null;if(url)URL.revokeObjectURL(url);url=null};return worker}
function rpc(command,args,transfer=[]){const w=ensure(),id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});w.postMessage({id,command,args},transfer)})}
export async function readModule(bytes,options){const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);return rpc('read',{bytes:input,options},[input.buffer])}
export function compose(modules,connections){return rpc('compose',{tokens:modules.map(m=>m._nativeToken),connections})}
export function exportResult(result){return rpc('export',{token:result._resultToken})}
