import {createHash, randomUUID} from 'node:crypto';
import {get,put,BlobPreconditionFailedError} from '@vercel/blob';
import {pinHash} from './domain.mjs';

export class AppError extends Error {
  constructor(message,status=400){super(message);this.name='AppError';this.status=status;}
}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function emptyState(){return {version:1,counters:{users:0,parcels:0,deliveries:0},users:[],sessions:[],attempts:[],parcels:[],deliveries:[],imports:[],commits:[]};}
function initialState(){
  const state=emptyState();
  const username=process.env.ADMIN_USERNAME||'admin';
  if(!/^[\p{L}\p{N}_-]{1,40}$/u.test(username)||!/^\d{4}$/.test(process.env.ADMIN_PIN||''))throw new AppError('请在 Vercel 配置初始 ADMIN_USERNAME 和4位数字 ADMIN_PIN',503);
  state.users.push({id:++state.counters.users,username,password:pinHash(process.env.ADMIN_PIN),role:'admin'});
  return state;
}
function parseState(body){
  const s=JSON.parse(body.toString());
  if(s.version!==1||!s.counters||!['users','sessions','attempts','parcels','deliveries','imports','commits'].every(k=>Array.isArray(s[k])))throw new AppError('存储数据格式不兼容，请检查备份；数据未被覆盖',503);
  return s;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Each business mutation commits one JSON document with an origin ETag.
// PDFs are immutable objects uploaded before the state references them.
export function createStore(backend,{seed=initialState,maxRetries=10}={}){
  async function snapshot(){const object=await backend.read('state.json');return object?{state:parseState(object.body),etag:object.etag}:null;}
  async function transact(mutate){
    const operation=randomUUID();
    for(let attempt=0;attempt<maxRetries;attempt++){
      const before=await snapshot();
      const state=before?before.state:seed();
      state.sessions=state.sessions.filter(s=>new Date(s.expires).getTime()>Date.now());
      state.attempts=state.attempts.filter(a=>a.updated_at>Date.now()-3600000);
      const result=await mutate(state);
      state.commits=[...state.commits.slice(-127),operation];
      const body=Buffer.from(JSON.stringify(state));
      if(body.length>20*1024*1024)throw new AppError('业务数据超过20MB，请归档历史记录后重试',503);
      try{
        await backend.writeState(body,before?.etag);
        return result;
      }catch(error){
        // A successful write whose response was lost must not repeat the mutation.
        const latest=await snapshot();
        if(latest?.state.commits.includes(operation))return result;
        if(!backend.isConflict(error)&&!(before===null&&latest))throw error;
        await pause(Math.min(25*2**attempt,500)+Math.random()*30);
      }
    }
    throw new AppError('其他司机正在更新数据，请稍后重试；本次更改尚未保存',409);
  }
  async function read(){const current=await snapshot();if(current)return current.state;await transact(()=>null);return (await snapshot()).state;}
  return {read,transact,readFile:key=>backend.read(key),writeFile:async(directory,body,name,contentType)=>{
    const key=`${directory}/${digest(body)}/${name}`;
    await backend.writeFile(key,body,contentType);return key;
  }};
}
export function blobBackend(){
  const prefix=(process.env.BLOB_PREFIX||`anji-delivery/${process.env.VERCEL_ENV||'development'}/v1`).replace(/\/+$/,'');
  if(!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix))throw new AppError('BLOB_PREFIX 格式无效',503);
  function options(){
    if(!process.env.BLOB_READ_WRITE_TOKEN)throw new AppError('请连接 Private Vercel Blob Store，配置 BLOB_READ_WRITE_TOKEN',503);
    return {access:'private',token:process.env.BLOB_READ_WRITE_TOKEN};
  }
  return {
    async read(key){const r=await get(`${prefix}/${key}`,{...options(),useCache:false});if(!r)return null;if(r.statusCode!==200)throw new AppError('无法读取最新存储版本',503);return {body:Buffer.from(await new Response(r.stream).arrayBuffer()),etag:r.blob.etag};},
    async writeState(body,etag){return put(`${prefix}/state.json`,body,{...options(),addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,...(etag?{ifMatch:etag,allowOverwrite:true}:{allowOverwrite:false})});},
    async writeFile(key,body,contentType){return put(`${prefix}/${key}`,body,{...options(),contentType,addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60});},
    isConflict:error=>error instanceof BlobPreconditionFailedError,
  };
}
let instance;
export async function getStore(){
  if(!instance)instance=(async()=>{
    if(process.env.BLOB_LOCAL_DIR){
      if(process.env.VERCEL)throw new AppError('Vercel 部署必须使用 Blob，不能使用本地临时目录',503);
      const {localBackend}=await import('./storage-local.mjs');
      return createStore(localBackend(process.env.BLOB_LOCAL_DIR));
    }
    return createStore(blobBackend());
  })();
  return instance;
}
