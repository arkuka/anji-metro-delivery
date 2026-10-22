import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore,emptyState,digest} from '../lib/storage.mjs';
import {localBackend} from '../lib/storage-local.mjs';

test('independent writers preserve concurrent mutations and initial create races',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'blob-cas-'));
 try{
  const writers=Array.from({length:8},()=>createStore(localBackend(dir),{seed:emptyState}));
  await Promise.all(writers.map(s=>s.transact(state=>{state.counters.parcels++;})));
  const state=await writers[0].read();assert.equal(state.counters.parcels,8);assert.equal(state.commits.length,8);
  await assert.rejects(writers[0].transact(state=>{state.counters.parcels=999;throw Error('upload failed');}));
  assert.equal((await writers[0].read()).counters.parcels,8);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('lost acknowledgement does not apply an operation twice',async()=>{
 let object=null,failOnce=true;
 const backend={read:async()=>object,writeState:async body=>{object={body,etag:digest(body)};if(failOnce){failOnce=false;throw Error('response lost');}},isConflict:()=>false};
 const store=createStore(backend,{seed:emptyState});
 assert.equal(await store.transact(s=>++s.counters.parcels),1);
 assert.equal((await store.read()).counters.parcels,1);
});
test('corrupt state is not silently replaced; exhausted conflicts fail without success',async()=>{
 let writes=0;
 const corrupt=createStore({read:async()=>({body:Buffer.from('{bad'),etag:'1'}),writeState:async()=>writes++},{seed:emptyState});
 await assert.rejects(corrupt.transact(()=>{}));assert.equal(writes,0);
 let revision=0;const backend={read:async()=>({body:Buffer.from(JSON.stringify(emptyState())),etag:String(++revision)}),writeState:async()=>{throw Error('conflict');},isConflict:()=>true};
 await assert.rejects(createStore(backend,{seed:emptyState,maxRetries:1}).transact(()=>{}),e=>e.status===409);
});

test('unchanged-version write rejection is diagnosed rather than blaming other drivers',async()=>{
 const backend={read:async()=>({body:Buffer.from(JSON.stringify(emptyState())),etag:'unchanged'}),writeState:async()=>{throw Error('version mismatch');},isConflict:()=>true};
 await assert.rejects(createStore(backend,{seed:emptyState,maxRetries:1}).transact(()=>{}),e=>e.status===503&&e.code==='BLOB_VERSION_MISMATCH');
});
