import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';
import {GET,POST} from '../app/api/[...path]/route.js';

test('login and user creation work through actual Blob SDK when download ETag differs from metadata ETag',async()=>{
 const previous=getGlobalDispatcher(),mock=new MockAgent();mock.disableNetConnect();setGlobalDispatcher(mock);
 const names=['BLOB_LOCAL_DIR','BLOB_READ_WRITE_TOKEN','BLOB_PREFIX','ADMIN_USERNAME','ADMIN_PIN','VERCEL_BLOB_RETRIES'];
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{BLOB_LOCAL_DIR:'',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_teststore_synthetic_test_token',BLOB_PREFIX:'login-test/v1',ADMIN_USERNAME:'fixtureadmin',ADMIN_PIN:'0123',VERCEL_BLOB_RETRIES:'0'});
 let body=null,revision=0,metadataReads=0,conditionalWrites=0;
 const etag=()=>`"metadata-${revision}"`;
 const metadata=()=>({url:'https://teststore.private.blob.vercel-storage.com/login-test/v1/state.json',pathname:'login-test/v1/state.json',etag:etag()});
 mock.get('https://vercel.com').intercept({path:p=>p.startsWith('/api/blob?url='),method:'GET'}).reply(()=>{metadataReads++;return body?{statusCode:200,data:JSON.stringify(metadata())}:{statusCode:404,data:JSON.stringify({error:{code:'not_found'}})};}).persist();
 mock.get('https://teststore.private.blob.vercel-storage.com').intercept({path:'/login-test/v1/state.json?cache=0',method:'GET'}).reply(()=>body?{statusCode:200,data:body,responseOptions:{headers:{etag:`W/"download-${revision}"`,'content-type':'application/json'}}}:{statusCode:404,data:''}).persist();
 mock.get('https://vercel.com').intercept({path:p=>p.startsWith('/api/blob/?pathname='),method:'PUT'}).reply(options=>{
  const h=new Headers(options.headers);assert.equal(h.get('x-vercel-blob-access'),'private');
  if(body&&h.get('x-if-match')!==etag())return {statusCode:412,data:JSON.stringify({error:{code:'precondition_failed'}})};
  if(body)conditionalWrites++;
  body=Buffer.from(options.body);revision++;
  return {statusCode:200,data:JSON.stringify(metadata())};
 }).persist();
 async function request(path,payload,cookie){const req=new Request('https://test.example/api/'+path,{method:payload?'POST':'GET',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:payload?JSON.stringify(payload):undefined});return (payload?POST:GET)(req,{params:Promise.resolve({path:[path]})});}
 try{
  assert.equal((await request('me')).status,401);
  const admin=await request('login',{username:'fixtureadmin',pin:'0123'});assert.equal(admin.status,200);const cookie=admin.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('users',{username:'SUNNY',pin:'4567',role:'driver'},cookie)).status,200);
  const driver=await request('login',{username:'SUNNY',pin:'4567'});assert.equal(driver.status,200);const driverCookie=driver.headers.get('set-cookie').split(';')[0];
  const me=await request('me',null,driverCookie);assert.equal(me.status,200);assert.equal((await me.json()).role,'driver');
  const rejected=await request('login',{username:'SUNNY',pin:'9999'});assert.equal(rejected.status,401);assert.equal((await rejected.json()).error,'用户名或密码错误');
  assert(metadataReads>=6);assert(conditionalWrites>=4);assert.equal(JSON.parse(body).users.length,2);
 }finally{for(const key of names){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}setGlobalDispatcher(previous);await mock.close();}
});
