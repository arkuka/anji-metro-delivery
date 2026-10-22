import {importSummaries} from '../../../lib/import-summary.mjs';
import {importBatchIdentity,replaceImportBatch} from '../../../lib/import-batch.mjs';
import {hasAllowedOrigin} from '../../../lib/request-origin.mjs';
import {getStore,AppError,digest} from '../../../lib/storage.mjs';
import {pinHash,pinVerify,rowsToParcels,filename,parseDispatchDate,ValidationError} from '../../../lib/domain.mjs';
import {makePdf} from '../../../lib/pdf.mjs';
import {randomBytes} from 'node:crypto';
import {BlobError} from '@vercel/blob';
import ExcelJS from 'exceljs';
export const runtime='nodejs';
export const maxDuration=60;
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const publicUser=({id,username,role})=>({id,username,role});
function userFor(state,token){
  const session=state.sessions.find(s=>s.token===token&&new Date(s.expires)>new Date());
  const user=session&&state.users.find(u=>u.id===session.user_id);
  if(!user)throw new AppError('请先登录',401);return user;
}
const admin=user=>{if(user.role!=='admin')throw new AppError('需要管理员权限',403);};
function selectedDate(value){return value==='undated'?null:parseDispatchDate(value);}
const pending=(state,dealer,date)=>state.parcels.filter(p=>!p.delivery_id&&p.dealer===dealer&&p.dispatch_date===date).sort((a,b)=>a.id-b.id);

async function handle(req,ctx){
  try{
    const path=(await ctx.params).path.join('/'),method=req.method;
    if(method!=='GET'&&!hasAllowedOrigin(req))throw new AppError('请求来源无效',403);
    const store=await getStore();
    if(path==='login'&&method==='POST'){
      const {username,pin}=await req.json();
      if(typeof username!=='string'||username.length>100)throw new AppError('用户名或密码错误',401);
      const token=randomBytes(32).toString('hex');
      const result=await store.transact(state=>{
        let a=state.attempts.find(a=>a.username===username);
        if(a?.blocked_until>Date.now())return {error:'尝试过多，请15分钟后重试',status:429};
        const u=state.users.find(u=>u.username===username);
        if(!u||!pinVerify(String(pin),u.password)){
          if(!a){a={username,count:0};state.attempts.push(a);}
          if(a.blocked_until){a.count=0;a.blocked_until=null;}
          a.count++;a.updated_at=Date.now();if(a.count>=5)a.blocked_until=Date.now()+15*60*1000;
          return {error:'用户名或密码错误',status:401};
        }
        state.attempts=state.attempts.filter(a=>a.username!==username);
        state.sessions.push({token:digest(token),user_id:u.id,expires:new Date(Date.now()+12*3600000).toISOString()});
        return {ok:true};
      });
      if(result.error)return json({error:result.error},result.status);
      const response=json({ok:true});response.headers.set('set-cookie',`session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.NODE_ENV==='production'?'; Secure':''}`);return response;
    }
    const token=digest(req.headers.get('cookie')?.match(/(?:^|;\s*)session=([^;]+)/)?.[1]||'');
    const state=await store.read(),user=userFor(state,token);
    // Authorization is checked again inside every CAS mutation, including retries.
    const mutate=fn=>store.transact(s=>fn(s,userFor(s,token)));
    if(path==='me'&&method==='GET')return json(publicUser(user));
    if(path==='logout'&&method==='POST'){
      await mutate(s=>{s.sessions=s.sessions.filter(x=>x.token!==token);});const response=json({ok:true});response.headers.set('set-cookie','session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return response;
    }
    if(path==='password'&&method==='POST'){
      const b=await req.json(),password=pinHash(String(b.pin));
      await mutate((s,u)=>{if(!pinVerify(String(b.oldPin),u.password))throw new AppError('原密码错误');u.password=password;s.sessions=s.sessions.filter(x=>x.user_id!==u.id||x.token===token);});return json({ok:true});
    }
    if(path==='users'){
      admin(user);if(method==='GET')return json(state.users.map(publicUser));
      if(!['POST','PATCH','DELETE'].includes(method))throw new AppError('不支持此操作',405);
      const b=await req.json();
      const password=method==='DELETE'?null:pinHash(String(b.pin));
      await mutate((s,u)=>{
        admin(u);
        if(method==='POST'){
          if(!/^[\p{L}\p{N}_-]{1,40}$/u.test(b.username)||!['admin','driver'].includes(b.role))throw new AppError('用户名或角色无效');
          if(s.users.some(x=>x.username===b.username))throw new AppError('用户名已存在');
          s.users.push({id:++s.counters.users,username:b.username,password,role:b.role});
        }else{
          if(Number(b.id)===u.id)throw new AppError('请通过修改密码管理自己的账号');
          const target=s.users.find(x=>x.id===Number(b.id));if(!target)throw new AppError('用户不存在',404);
          if(method==='DELETE'){
            s.users=s.users.filter(x=>x!==target);
            for(const p of s.parcels)if(p.driver_id===target.id)p.driver_id=null;
            for(const d of s.deliveries)if(d.driver_id===target.id)d.driver_id=null;
          }else target.password=password;
          s.sessions=s.sessions.filter(x=>x.user_id!==target.id);
        }
      });return json({ok:true});
    }
    if(path==='imports'&&method==='GET'){admin(user);return json(importSummaries(state));}
    if(path==='import'&&method==='POST'){
      admin(user);const form=await req.formData(),file=form.get('file');
      if(!file||typeof file.arrayBuffer!=='function'||file.size>4*1024*1024)throw new AppError('请选择不超过4MB的xlsx文件');
      const bytes=Buffer.from(await file.arrayBuffer()),wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);
      const sheet=wb.worksheets[0];if(!sheet)throw new AppError('工作簿为空');
      const cell=sheet.getCell('C2');
      const batch=importBatchIdentity(cell.type===ExcelJS.ValueType.Formula?cell.result:cell.value,sheet.getCell('G3').text,wb.properties.date1904);
      const rows=[];for(let i=1;i<=sheet.rowCount;i++)rows.push(Array.from({length:8},(_,j)=>sheet.getRow(i).getCell(j+1).text));
      const parcels=rowsToParcels(rows),source=digest(bytes);
      const sourcePath=await store.writeFile('imports',bytes,'source.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const result=await mutate((s,u)=>{
        admin(u);return replaceImportBatch(s,{...batch,parcels,source,sourcePath,username:u.username});
      });return json(result);
    }
    if(path==='parcels'&&method==='GET')return json(state.parcels.filter(p=>!p.delivery_id).sort((a,b)=>(b.dispatch_date||'').localeCompare(a.dispatch_date||'')||a.dealer.localeCompare(b.dealer)||a.id-b.id).map(p=>({...p,driver_name:p.scanner_name||null})));
    if(path==='scan'&&method==='POST'){
      const b=await req.json(),date=selectedDate(b.dispatchDate);
      if(typeof b.dealer!=='string'||!b.dealer)throw new AppError('请先选择发货日期和Dealer');
      return json(await mutate((s,u)=>{const p=pending(s,b.dealer,date).find(p=>p.id===Number(b.id));if(!p)throw new AppError('托盘已提交或不存在');if(!p.scanned_at){p.scanned_at=new Date().toISOString();p.driver_id=u.id;p.scanner_name=u.username;}return {...p};}));
    }
    if(path==='submit'&&method==='POST'){
      const b=await req.json(),dispatchDate=selectedDate(b.dispatchDate);
      if(typeof b.signature!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(b.signature)||b.signature.length>1000000)throw new AppError('请提供客户签名');
      const result=await mutate(async(s,u)=>{
        const rows=pending(s,b.dealer,dispatchDate);
        if(!rows.length)throw new AppError('该Dealer没有待提交托盘');
        if(JSON.stringify(rows.map(r=>r.id))!==JSON.stringify(b.ids))throw new AppError('托盘列表已变化，请刷新后重新确认');
        if(rows.some(r=>!r.scanned_at)&&b.confirmMissing!==true)throw new AppError('仍有未扫描托盘，请明确确认派送失败');
        const time=new Date(),name=filename(b.dealer,time,process.env.APP_TIMEZONE||'Australia/Sydney');
        const pdf=await makePdf(b.dealer,rows,b.signature,u.username,time);
        const pdfPath=await store.writeFile('receipts',pdf,name,'application/pdf');
        const id=++s.counters.deliveries;
        s.deliveries.push({id,dealer:b.dealer,dispatch_date:dispatchDate,driver_id:u.id,driver_name:u.username,created_at:time.toISOString(),filename:name,pdf_path:pdfPath,batch_keys:[...new Set(rows.map(p=>p.batch_key).filter(Boolean))]});
        for(const p of rows)p.delivery_id=id;
        return {id,filename:name};
      });return json(result);
    }
    if(path==='deliveries'&&method==='GET')return json(state.deliveries.filter(d=>user.role==='admin'||d.driver_id===user.id).sort((a,b)=>b.id-a.id).slice(0,200).map(({pdf_path,...d})=>d));
    if(/^pdf\/\d+$/.test(path)&&method==='GET'){
      const d=state.deliveries.find(d=>d.id===Number(path.split('/')[1])&&(user.role==='admin'||d.driver_id===user.id));
      if(!d)throw new AppError('文件不存在',404);const object=await store.readFile(d.pdf_path);if(!object)throw new AppError('签收PDF暂时不可用，请联系管理员',503);
      return new Response(new Uint8Array(object.body),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(d.filename)}`,'Cache-Control':'private, no-store'}});
    }
    throw new AppError('接口不存在',404);
  }catch(error){
    // Never expose SDK error messages: storage URLs/tokens may be included.
    if(error instanceof AppError)return json({error:error.message,...(error.code?{code:error.code}:{})},error.status);
    if(error instanceof ValidationError)return json({error:error.message},400);
    console.error('Request failed:',error.name);
    if(error instanceof BlobError||(error instanceof TypeError&&error.message==='fetch failed'))return json({error:'Blob 存储访问失败，请检查私有存储连接、Token 和服务配额'},503);
    return json({error:'操作失败，请检查日期、Excel或签名文件是否有效'},400);
  }
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
