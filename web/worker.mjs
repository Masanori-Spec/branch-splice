import{readModule}from'../src/archive.mjs';import{compose,exportResult}from'../src/compose.mjs';
const modules=new Map(),results=new Map();let sequence=0;
function storeModule(m){const token=`module-${++sequence}`;modules.set(token,m);return {...m,files:null,_nativeToken:token}}
self.onmessage=async e=>{const{id,command,args}=e.data;try{let result,transfer=[];
 if(command==='read')result=storeModule(await readModule(args.bytes,args.options));
 else if(command==='compose'){const selected=args.tokens.map(t=>modules.get(t));if(selected.some(x=>!x))throw Error('Input state expired. Reload the files.');const r=await compose(selected,args.connections),token=`result-${++sequence}`;results.set(token,r);while(results.size>8)results.delete(results.keys().next().value);result={...r,files:null,_resultToken:token};}
 else if(command==='export'){const r=results.get(args.token);if(!r)throw Error('Export state expired. Validate again.');result=await exportResult(r);transfer=[result.h5p.buffer];}
 else throw Error('Unknown worker command');self.postMessage({id,result},transfer);
 }catch(error){self.postMessage({id,error:{name:error.name??'Error',code:error.code??'ERROR',message:error.message??String(error),detail:error.detail??{}}})}};
