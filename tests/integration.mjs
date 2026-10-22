import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {pool,schema} from '../lib/db.mjs';
import {pinHash} from '../lib/domain.mjs';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const suffix=Date.now().toString(),admin='testadmin'+suffix,driver='driver'+suffix,dealer='Dealer'+suffix;let cookie='',driverCookie='';let assertions=0;
async function call(path,body,method='POST',session=cookie){const r=await fetch(base+'/api/'+path,{method,headers:{...(session?{cookie:session}:{}),...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});return r;}
function check(condition){assert(condition);assertions++;}
try{await pool.query(schema);await pool.query("INSERT INTO users(username,password,role) VALUES($1,$2,'admin')",[admin,pinHash('0123')]);
let r=await call('login',{username:admin,pin:'0123'});check(r.ok);cookie=r.headers.get('set-cookie').split(';')[0];
r=await call('users',{username:driver,pin:'4567',role:'driver'});check(r.ok);
r=await call('login',{username:driver,pin:'4567'});check(r.ok);driverCookie=r.headers.get('set-cookie').split(';')[0];
r=await call('users',null,'GET',driverCookie);check(r.status===403);
const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Parcels');sheet.getRow(9).values=['1',dealer,'2','00001','00011','东区','客户地址','LOAD'+suffix];sheet.getRow(10).values=['2',dealer,'','00002','00012','东区','客户地址','LOAD'+suffix];
const form=new FormData();form.set('file',new Blob([await wb.xlsx.writeBuffer()]),'test.xlsx');r=await call('import',form);check(r.ok);check((await r.json()).inserted===2);
r=await call('import',form);check((await r.json()).skipped===2);
r=await call('parcels',null,'GET',driverCookie);const rows=(await r.json()).filter(p=>p.dealer===dealer);check(rows.length===2);
r=await call('scan',{id:rows[0].id},'POST',driverCookie);const first=await r.json();check(!!first.scanned_at);
r=await call('scan',{id:rows[0].id},'POST',driverCookie);check((await r.json()).scanned_at===first.scanned_at);
const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const payload={dealer,ids:rows.map(r=>r.id),signature};r=await call('submit',payload,'POST',driverCookie);check(r.status===400);r=await call('submit',{...payload,confirmMissing:true},'POST',driverCookie);if(!r.ok)throw Error(await r.text());const saved=await r.json();check(saved.filename.endsWith('-'+dealer+'.PDF'));
r=await call('pdf/'+saved.id,null,'GET',driverCookie);check(r.headers.get('content-type')==='application/pdf');check(Buffer.from(await r.arrayBuffer()).subarray(0,4).toString()==='%PDF');
r=await call('submit',{...payload,confirmMissing:true},'POST',driverCookie);check(r.status===400);
const stored=(await pool.query('SELECT p.*,d.pdf FROM parcels p JOIN deliveries d ON p.delivery_id=d.id WHERE p.dealer=$1 ORDER BY p.id',[dealer])).rows;check(stored.length===2&&stored[0].scanned_at&&!stored[1].scanned_at);check(stored[0].scanner_name===driver);
// A fully scanned delivery must submit without missing-pallet confirmation.
const completeDealer=dealer+'Complete';await pool.query('INSERT INTO parcels(dealer,pallet,order_no,load_no) VALUES($1,$2,$3,$4)',[completeDealer,'COMPLETE'+suffix,'ORDER'+suffix,'LOAD'+suffix]);
const completeRows=(await pool.query('SELECT id FROM parcels WHERE dealer=$1',[completeDealer])).rows;
r=await call('scan',{id:completeRows[0].id},'POST',driverCookie);check(r.ok);
r=await call('submit',{dealer:completeDealer,ids:completeRows.map(p=>p.id),signature},'POST',driverCookie);check(r.ok);
r=await call('password',{oldPin:'4567',pin:'8910'},'POST',driverCookie);check(r.ok);
console.log(`PASS: ${assertions} integration assertions (auth, roles, xlsx, idempotency, scan time, missing confirmation, signature PDF persistence, duplicate submission, password change).`);
}finally{
// Remove only records created by this exact run, including on assertion failures.
try {
await pool.query('DELETE FROM parcels WHERE dealer=ANY($1::text[])',[[dealer,dealer+'Complete']]);
await pool.query('DELETE FROM deliveries WHERE dealer=ANY($1::text[])',[[dealer,dealer+'Complete']]);
await pool.query('DELETE FROM users WHERE username=ANY($1::text[])',[[admin,driver]]);
await pool.query('DELETE FROM login_attempts WHERE username=ANY($1::text[])',[[admin,driver]]);
console.log('Integration test data cleaned.');
} finally { await pool.end(); }
}
