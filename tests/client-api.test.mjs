import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestApi,ApiError} from '../lib/client-api.mjs';
test('API errors retain status and actionable server message',async()=>{
 await assert.rejects(requestApi('me',null,'GET',{fetchImpl:async()=>Response.json({error:'请先登录'},{status:401})}),e=>e instanceof ApiError&&e.status===401&&e.message==='请先登录');
});
test('gateway HTML errors and network failures are visible rather than JSON parser messages',async()=>{
 await assert.rejects(requestApi('login',{},'POST',{fetchImpl:async()=>new Response('<html>Bad gateway</html>',{status:502})}),e=>e.status===502&&e.message.includes('无效响应'));
 await assert.rejects(requestApi('login',{},'POST',{fetchImpl:async()=>{throw TypeError('Failed to fetch');}}),/网络连接失败/);
});
test('hung login requests time out and abort fetch',async()=>{
 let aborted=false;
 await assert.rejects(requestApi('login',{},'POST',{timeoutMs:10,fetchImpl:(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));}))}),/请求超时/);
 assert(aborted);
});
