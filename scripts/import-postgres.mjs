// Optional one-time migration. Source database is read-only; target must be empty.
import pg from 'pg';
import {createStore,blobBackend,emptyState,AppError} from '../lib/storage.mjs';
if(!process.env.LEGACY_DATABASE_URL)throw new AppError('请安全设置旧数据库的 LEGACY_DATABASE_URL');
if(process.env.BLOB_LOCAL_DIR)throw new AppError('此脚本仅迁移到真实 Private Blob Store');
const source=new pg.Client({connectionString:process.env.LEGACY_DATABASE_URL,connectionTimeoutMillis:15000});
const store=createStore(blobBackend(),{seed:emptyState});
try{
  await source.connect();await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const data={};for(const table of ['users','sessions','login_attempts','parcels','deliveries'])data[table]=(await source.query(`SELECT * FROM ${table}`)).rows;
  await source.query('COMMIT');
  if(!data.users.some(u=>u.role==='admin'))throw new AppError('旧数据库中没有管理员，未迁移');
  // Refuse existing application data before uploading any files.
  const current=await blobBackend().read('state.json');
  if(current)throw new AppError('目标 Blob 已有业务数据，请选择全新的 BLOB_PREFIX；不会覆盖已有记录');
  const deliveries=[];
  for(const d of data.deliveries){const {pdf,...record}=d;deliveries.push({...record,dispatch_date:d.dispatch_date||null,created_at:new Date(d.created_at).toISOString(),pdf_path:await store.writeFile('receipts',pdf,d.filename,'application/pdf')});}
  await store.transact(state=>{
    if(state.users.length||state.parcels.length||state.deliveries.length)throw new AppError('目标 Blob 已有业务数据，迁移中止');
    state.users=data.users;
    state.parcels=data.parcels.map(p=>({...p,dispatch_date:p.dispatch_date||null,scanned_at:p.scanned_at?new Date(p.scanned_at).toISOString():null,scanner_name:p.scanner_name||data.users.find(u=>u.id===p.driver_id)?.username||null}));
    state.deliveries=deliveries;
    // Require a fresh login after moving credentials to the new backend.
    state.sessions=[];state.attempts=[];
    for(const key of ['users','parcels','deliveries'])state.counters[key]=state[key].reduce((n,x)=>Math.max(n,x.id),0);
  });
  console.log(`迁移完成：${data.users.length} 个用户、${data.parcels.length} 个托盘、${deliveries.length} 份签收PDF。旧数据库未修改，请核验后自行决定是否停用。`);
}catch(error){console.error(error instanceof AppError?error.message:'迁移失败；请检查源数据库和Blob配置，避免在日志中输出凭据。');process.exitCode=1;}finally{await source.end();}
