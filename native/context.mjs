import H5P from '@lumieducation/h5p-server';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
export const runtime=path.resolve('native/runtime');
export const user={id:'synthetic-author',name:'Synthetic Author',type:'local',email:'author@example.invalid'};
export async function context(){
 const t=await i18next.use(Backend).init({backend:{loadPath:path.resolve('node_modules/@lumieducation/h5p-server/build/assets/translations/{{ns}}/{{lng}}.json')},defaultNS:'server',fallbackLng:'en',preload:['en'],ns:['client','copyright-semantics','hub','library-metadata','metadata-semantics','server','storage-file-implementations']});
 const config=new H5P.H5PConfig(undefined,{baseUrl:'/h5p',contentHubEnabled:false,fetchingDisabled:1,sendUsageStatistics:false,contentUserStateSaveInterval:false,setFinishedEnabled:false,maxFileSize:32*1024*1024,maxTotalSize:128*1024*1024});
 for(const p of ['libraries','temporary','content']) await mkdir(path.join(runtime,p),{recursive:true});
 const editor=H5P.fs(config,path.join(runtime,'libraries'),path.join(runtime,'temporary'),path.join(runtime,'content'),undefined,undefined,(key,language)=>t(key,{lng:language}));
 const player=new H5P.H5PPlayer(editor.libraryStorage,editor.contentStorage,config,undefined,undefined,(key,language)=>t(key,{lng:language}));
 return {editor,player,config,i18next};
}
