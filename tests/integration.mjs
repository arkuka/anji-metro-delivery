import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
const directory=await mkdtemp(join(tmpdir(),'metro-blob-e2e-'));
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://127.0.0.1:${port}`;let logs='',checks=0;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',BLOB_LOCAL_DIR:directory,ADMIN_USERNAME:'testadmin',ADMIN_PIN:'0123'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',s=>logs=(logs+s).slice(-8000));app.stderr.on('data',s=>logs=(logs+s).slice(-8000));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function check(condition,label){assert(condition,label);checks++;}
async function request(path,{body,method=body?'POST':'GET',cookie=''}={}){
 return fetch(base+'/api/'+path,{method,headers:{...(cookie?{cookie}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
}
async function login(username,pin){const r=await request('login',{body:{username,pin}});check(r.ok,'login '+username);return r.headers.get('set-cookie').split(';')[0];}
async function workbook(date,g3='BATCH01',pallets=['00001','00002']){const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Parcels');sheet.getCell('C2').value=date;sheet.getCell('G3').value=g3;for(let i=0;i<pallets.length;i++)sheet.getRow(i+9).values=[String(i+1),'DEALER01',i?'':String(pallets.length),pallets[i],'ORDER'+(i+1),'东区','客户地址','LOAD01'];const form=new FormData();form.set('file',new Blob([await wb.xlsx.writeBuffer()]),'parcels.xlsx');return form;}
async function stored(){return JSON.parse(await readFile(join(directory,'state.json'),'utf8'));}
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}if(app.exitCode!==null)throw Error('App exited during startup');await pause(200);}check(ready,'production startup and homepage HTTP 200');
 check((await request('parcels')).status===401,'authentication required');
 for(let i=0;i<5;i++)check((await request('login',{body:{username:'unknown',pin:'0000'}})).status===401,'failed login');
 check((await request('login',{body:{username:'unknown',pin:'0000'}})).status===429,'failed attempts persisted and lock account');
 const admin=await login('testadmin','0123');
 for(const username of ['driver1','driver2'])check((await request('users',{cookie:admin,body:{username,pin:'4567',role:'driver'}})).ok,'create driver');
 const driver=await login('driver1','4567'),other=await login('driver2','4567');
 check((await request('users',{cookie:driver})).status===403,'driver cannot manage accounts');
 check((await request('imports',{cookie:driver})).status===403,'driver cannot read administrator import audit');
 check((await request('import',{cookie:driver,body:await workbook('2026-10-22')})).status===403,'driver cannot import');
 for(const date of [null,'2026-02-30'])check((await request('import',{cookie:admin,body:await workbook(date)})).status===400,'invalid Excel C2 rejected');
 const imported=await Promise.all([1,2].map(async()=>{const r=await request('import',{cookie:admin,body:await workbook('2026-10-22')});check(r.ok,'concurrent import succeeded');return r.json();}));
 check(imported.reduce((n,r)=>n+r.inserted,0)===4&&imported.reduce((n,r)=>n+r.removed,0)===2,'same-key concurrent uploads replace whole batch without duplicates');
 let r=await request('import',{cookie:admin,body:await workbook('23/10/2026')});check(r.ok&&(await r.json()).inserted===2,'same pallets on next date imported independently');
 const parcels=await (await request('parcels',{cookie:driver})).json();check(parcels.length===4,'four pallets across two dates');
 const first=parcels.filter(p=>p.dispatch_date==='2026-10-22').sort((a,b)=>a.id-b.id),second=parcels.filter(p=>p.dispatch_date==='2026-10-23').sort((a,b)=>a.id-b.id);
 const scanBody={id:first[0].id,dealer:'DEALER01',dispatchDate:'2026-10-22'};
 check((await request('scan',{cookie:driver,body:{...scanBody,dispatchDate:'2026-10-23'}})).status===400,'cannot scan cross-date pallet');
 r=await request('scan',{cookie:driver,body:scanBody});check(r.ok,'scan persists');const scanned=await r.json();
 r=await request('scan',{cookie:other,body:scanBody});const repeated=await r.json();check(repeated.scanned_at===scanned.scanned_at&&repeated.scanner_name==='driver1','repeat scan preserves first time and driver');
 const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const payload={dealer:'DEALER01',dispatchDate:'2026-10-22',ids:first.map(p=>p.id),signature};
 check((await request('submit',{cookie:driver,body:{...payload,ids:parcels.map(p=>p.id),confirmMissing:true}})).status===400,'cross-date receipt rejected');
 check((await request('submit',{cookie:driver,body:payload})).status===400,'missing pallets require confirmation');
 check((await request('submit',{cookie:driver,body:{...payload,signature:'',confirmMissing:true}})).status===400,'signature required');
 r=await request('submit',{cookie:driver,body:{...payload,confirmMissing:true}});check(r.ok,'partial delivery and PDF committed');const receipt=await r.json();
 const state=await stored(),saved=state.deliveries.find(d=>d.id===receipt.id);check(saved.dispatch_date==='2026-10-22','receipt stores dispatch date');
 check(state.parcels.filter(p=>p.dispatch_date==='2026-10-23').every(p=>!p.scanned_at&&!p.delivery_id),'next date unaffected');
 check(state.imports.length===2,'source Excel indexes persisted');
 const importsAudit=await (await request('imports',{cookie:admin})).json();check(importsAudit.length===2&&importsAudit.every(i=>i.pallet_count===2),'import audit reports actual committed pallet counts');check(importsAudit.find(i=>i.dispatch_date==='2026-10-22').pending_count===0&&importsAudit.find(i=>i.dispatch_date==='2026-10-23').pending_count===2,'import audit distinguishes signed and pending batches');
 check((await readFile(join(directory,saved.pdf_path))).subarray(0,4).toString()==='%PDF','PDF exists separately from JSON state');
 r=await request('pdf/'+receipt.id,{cookie:driver});check(r.ok&&r.headers.get('content-type')==='application/pdf','owner PDF download');check(Buffer.from(await r.arrayBuffer()).subarray(0,4).toString()==='%PDF','download is actual PDF');
 check((await request('pdf/'+receipt.id)).status===401,'PDF requires login');check((await request('pdf/'+receipt.id,{cookie:other})).status===404,'another driver cannot download PDF');
 const scanResults=await Promise.all(second.map((p,i)=>request('scan',{cookie:i?other:driver,body:{id:p.id,dealer:p.dealer,dispatchDate:p.dispatch_date}})));check(scanResults.every(r=>r.ok),'concurrent scans both succeed');
 const secondPayload={...payload,dispatchDate:'2026-10-23',ids:second.map(p=>p.id)};
 const submissions=await Promise.all([1,2].map(()=>request('submit',{cookie:driver,body:secondPayload})));check(submissions.filter(r=>r.ok).length===1,'concurrent signoff creates exactly one receipt');
 check((await stored()).deliveries.length===2,'exactly two signed deliveries persisted');
 check((await (await request('parcels',{cookie:driver})).json()).length===0,'all submitted pallets removed from pending view');
 const driverId=(await stored()).users.find(u=>u.username==='driver1').id;
 check((await request('users',{cookie:admin,method:'PATCH',body:{id:driverId,pin:'8910'}})).ok,'admin resets password');
 check((await request('me',{cookie:driver})).status===401,'reset invalidates existing sessions');
 const newSession=await login('driver1','8910');
 check((await request('password',{cookie:newSession,body:{oldPin:'8910',pin:'2345'}})).ok,'driver changes own password');
 check((await request('login',{body:{username:'driver1',pin:'8910'}})).status===401,'old PIN rejected');
 await login('driver1','2345');
 check((await request('users',{cookie:admin,method:'DELETE',body:{id:driverId}})).ok,'delete driver');
 const finalState=await stored();check(finalState.parcels.some(p=>p.scanner_name==='driver1')&&finalState.deliveries.every(d=>d.driver_name==='driver1'),'audit driver names retained after account deletion');
 check((await request('pdf/'+receipt.id,{cookie:admin})).ok,'administrator still downloads receipt');
 check(!JSON.stringify(finalState).includes(admin.split('=')[1]),'raw session token is not persisted');
 check(finalState.users.every(u=>u.password.includes(':')&&u.password.length>100),'password hashes persisted');

 // Replacing signed data resets the batch but preserves receipt files and other keys.
 const initialBatchKey=JSON.stringify(['2026-10-22','BATCH01']);
 const otherDateBefore=(await stored()).parcels.filter(p=>p.dispatch_date==='2026-10-23');
 r=await request('import',{cookie:admin,body:await workbook('22/10/2026',' BATCH01 ',['NEW1'])});
 const replaced=await r.json();check(r.ok&&replaced.removed===2&&replaced.inserted===1,'normalized same key deletes all signed old rows and adds new list');
 let after=await stored(),fresh=after.parcels.filter(p=>p.batch_key===initialBatchKey);
 check(fresh.length===1&&fresh[0].pallet==='NEW1'&&!fresh[0].scanned_at&&!fresh[0].delivery_id,'replacement resets all scanning and delivery state');
 check(JSON.stringify(after.parcels.filter(p=>p.dispatch_date==='2026-10-23'))===JSON.stringify(otherDateBefore),'same G3 on a different date is unchanged');
 check(after.deliveries.length===2&&(await request('pdf/'+receipt.id,{cookie:admin})).ok,'historical signed PDF remains downloadable');
 check((await request('scan',{cookie:other,body:scanBody})).status===400,'stale pallet id cannot scan replacement');
 check((await request('submit',{cookie:other,body:{...payload,confirmMissing:true}})).status===400,'stale signature form cannot submit replacement');
 r=await request('import',{cookie:admin,body:await workbook('2026-10-22','BATCH02',['NEW1'])});check(r.ok&&(await r.json()).removed===0,'same date with different G3 creates independent batch even with same pallet');
 const separateKey=JSON.stringify(['2026-10-22','BATCH02']);
 const separateBefore=(await stored()).parcels.filter(p=>p.batch_key===separateKey);
 r=await request('import',{cookie:admin,body:await workbook('2026-10-22','BATCH01',['NEW2','NEW3'])});const changed=await r.json();check(r.ok&&changed.removed===1&&changed.inserted===2,'replacement uses exact new row count');
 after=await stored();check(JSON.stringify(after.parcels.filter(p=>p.batch_key===separateKey))===JSON.stringify(separateBefore),'different G3 records remain byte-for-byte unchanged');
 check(after.imports.filter(i=>i.batch_key===initialBatchKey).length===1,'batch metadata replaced instead of accumulated');
 const beforeInvalid=JSON.stringify(after.parcels);
 for(const g3 of [null,'','   '])check((await request('import',{cookie:admin,body:await workbook('2026-10-22',g3)})).status===400,'missing G3 rejects entire upload');
 check((await request('import',{cookie:admin,body:await workbook('2026-10-22','BATCH01',[])})).status===400,'empty batch rejected before deletion');
 check(JSON.stringify((await stored()).parcels)===beforeInvalid,'invalid files never delete prior batch');
 const replacements=await Promise.all([['FINAL-A'],['FINAL-B1','FINAL-B2']].map(async pallets=>request('import',{cookie:admin,body:await workbook('2026-10-22','BATCH01',pallets)})));
 check(replacements.every(r=>r.ok),'concurrent different-content replacements both serialize successfully');
 const finalBatch=(await stored()).parcels.filter(p=>p.batch_key===initialBatchKey).map(p=>p.pallet).sort();
 check(JSON.stringify(finalBatch)===JSON.stringify(['FINAL-A'])||JSON.stringify(finalBatch)===JSON.stringify(['FINAL-B1','FINAL-B2']),'concurrent replacement keeps one complete file, never merges files');
 console.log(`PASS: ${checks} HTTP integration assertions using explicit local Blob emulator (auth, C2+G3 batch replacement, concurrency, Excel, dates, scanning, signatures, private PDFs, user management).`);
}catch(error){console.error('Application logs:',logs);throw error;}finally{
 app.kill('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),pause(3000)]);if(app.exitCode===null)app.kill('SIGKILL');
 await rm(directory,{recursive:true,force:true});console.log('Temporary test application and data cleaned.');
}
