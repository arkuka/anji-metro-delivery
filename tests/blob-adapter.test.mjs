import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';
import {blobBackend,emptyState} from '../lib/storage.mjs';

test('real Blob SDK uses private origin reads, conditional writes and private file uploads',async()=>{
 const previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
 const oldToken=process.env.BLOB_READ_WRITE_TOKEN,oldPrefix=process.env.BLOB_PREFIX,oldRetries=process.env.VERCEL_BLOB_RETRIES;process.env.VERCEL_BLOB_RETRIES='0';
 process.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_teststore_synthetic_test_token';process.env.BLOB_PREFIX='test/v1';
 const object=mock.get('https://teststore.private.blob.vercel-storage.com'),api=mock.get('https://vercel.com');
 const state=Buffer.from(JSON.stringify(emptyState()));let reads=0;
 object.intercept({path:'/test/v1/state.json?cache=0',method:'GET'}).reply(options=>{reads++;assert(options.headers.authorization.startsWith('Bearer '));return {statusCode:200,data:state,responseOptions:{headers:{etag:'version-1','content-type':'application/json'}}};});
 function expectPut(etag){api.intercept({path:path=>path.startsWith('/api/blob'),method:'PUT'}).reply(options=>{
   const headers=new Headers(options.headers);
   assert.equal(headers.get('x-vercel-blob-access'),'private');
   assert.equal(headers.get('x-allow-overwrite'),etag?'1':'0');
   assert.equal(headers.get('x-if-match'),etag||null);
   return {statusCode:200,data:JSON.stringify({url:'https://teststore.private.blob.vercel-storage.com/test/v1/state.json',downloadUrl:'https://teststore.private.blob.vercel-storage.com/test/v1/state.json',pathname:'test/v1/state.json',etag:'version-2'})};
 });}
 try{
  const backend=blobBackend(),snapshot=await backend.read('state.json');assert.equal(snapshot.etag,'version-1');assert.deepEqual(snapshot.body,state);assert.equal(reads,1);
  expectPut('version-1');await backend.writeState(state,'version-1');
  expectPut();await backend.writeState(state);
  api.intercept({path:path=>path.startsWith('/api/blob'),method:'PUT'}).reply(412,{error:{code:'precondition_failed'}});
  await assert.rejects(backend.writeState(state,'stale-etag'),error=>backend.isConflict(error));
  api.intercept({path:path=>path.startsWith('/api/blob'),method:'PUT'}).reply(options=>{const h=new Headers(options.headers);assert.equal(h.get('x-vercel-blob-access'),'private');return {statusCode:200,data:JSON.stringify({url:'https://teststore.private.blob.vercel-storage.com/test/v1/receipt.pdf',pathname:'test/v1/receipt.pdf',etag:'pdf-1'})};});
  await backend.writeFile('receipt.pdf',Buffer.from('%PDF-fixture'),'application/pdf');mock.assertNoPendingInterceptors();
 }finally{if(oldToken===undefined)delete process.env.BLOB_READ_WRITE_TOKEN;else process.env.BLOB_READ_WRITE_TOKEN=oldToken;if(oldPrefix===undefined)delete process.env.BLOB_PREFIX;else process.env.BLOB_PREFIX=oldPrefix;if(oldRetries===undefined)delete process.env.VERCEL_BLOB_RETRIES;else process.env.VERCEL_BLOB_RETRIES=oldRetries;setGlobalDispatcher(previous);await mock.close();}
});
