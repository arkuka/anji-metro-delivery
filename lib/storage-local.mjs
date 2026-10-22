// Explicit local emulator for development/tests. Never enabled in Vercel.
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {resolve,sep,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest} from './storage.mjs';
export function localBackend(directory){
  const root=resolve(directory),lock=resolve(root,'.write-lock');
  function file(key){const p=resolve(root,key);if(!p.startsWith(root+sep))throw Error('Invalid local object path');return p;}
  async function read(key){try{const body=await readFile(file(key));return {body,etag:digest(body)};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
  async function atomic(key,body){const path=file(key);await mkdir(dirname(path),{recursive:true,mode:0o700});const tmp=path+'.'+randomUUID();await writeFile(tmp,body,{mode:0o600});await rename(tmp,path);}
  return {read,
    async writeState(body,etag){
      await mkdir(root,{recursive:true,mode:0o700});
      try{await mkdir(lock);}catch(e){if(e.code==='EEXIST')throw Object.assign(Error('Conflict'),{code:'CONFLICT'});throw e;}
      try{const current=await read('state.json');if(current?.etag!==etag)throw Object.assign(Error('Conflict'),{code:'CONFLICT'});await atomic('state.json',body);}finally{await rm(lock,{recursive:true});}
    },
    writeFile:atomic,isConflict:e=>e.code==='CONFLICT'};
}
