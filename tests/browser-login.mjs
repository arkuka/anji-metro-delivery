import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import ExcelJS from 'exceljs';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
const directory=await mkdtemp(join(tmpdir(),'metro-login-browser-'));
const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
const base=`http://localhost:${port}`,pause=ms=>new Promise(r=>setTimeout(r,ms));let logs='',checks=0,browser;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,VERCEL:'',BLOB_READ_WRITE_TOKEN:'',BLOB_LOCAL_DIR:directory,ADMIN_USERNAME:'browseradmin',ADMIN_PIN:'0123'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',s=>logs=(logs+s).slice(-8000));app.stderr.on('data',s=>logs=(logs+s).slice(-8000));
function check(condition,label){assert(condition,label);checks++;}
async function fillLogin(page,username,pin){await page.getByLabel('用户名',{exact:true}).fill(username);await page.getByLabel('4位数字密码').fill(pin);}
async function submit(page){await page.getByRole('button',{name:'登录工作台',exact:false}).click();}
async function dashboard(page){await page.locator('main h1').filter({hasText:'派送工作台'}).waitFor();check(await page.locator('main h1').innerText()==='派送工作台','login lands on delivery dashboard');}
async function logout(page){await page.getByRole('button',{name:'退出',exact:true}).click();await page.getByLabel('用户名',{exact:true}).waitFor();}
try{
 let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}if(app.exitCode!==null)throw Error('App startup failed');await pause(200);}check(ready,'production server startup');
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:width<600,isMobile:width<600});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await fillLogin(page,'browseradmin','0123');await submit(page);await dashboard(page);
  await page.getByRole('button',{name:'用户管理',exact:true}).click();
  const username='newdriver'+width;
  await page.getByPlaceholder('用户名',{exact:true}).fill(username);await page.getByLabel('新用户密码').fill('4567');await page.getByRole('button',{name:'新增',exact:true}).click();await page.getByText('用户已创建',{exact:true}).waitFor();
  await logout(page);
  await fillLogin(page,username,'0000');await submit(page);await page.locator('main [role="alert"]').filter({hasText:'用户名或密码错误'}).waitFor();check(await page.locator('main [role="alert"]').isVisible(),'wrong password feedback visible');
  await fillLogin(page,username,'12');await submit(page);await page.locator('main [role="alert"]').filter({hasText:'密码必须是4位数字'}).waitFor();check(await page.locator('main [role="alert"]').isVisible(),'invalid PIN does not silently block form submission');
  await fillLogin(page,' '+username+' ','4567');
  let release;const gate=new Promise(r=>release=r);
  await page.route('**/api/login',async route=>{await gate;await route.continue();},{times:1});
  await submit(page);await page.getByRole('button',{name:'正在登录…'}).waitFor();check(await page.getByRole('button',{name:'正在登录…'}).isDisabled(),'login progress visible and duplicate clicks disabled');release();
  await dashboard(page);check(await page.getByRole('button',{name:'用户管理',exact:true}).count()===0,'driver has no admin navigation');check(await page.getByText('新增用户',{exact:true}).count()===0,'old administrator panel cleared');
  const role=await page.evaluate(()=>fetch('/api/me').then(r=>r.json()).then(u=>u.role));check(role==='driver','new account authenticated as driver');
  if(width===390){
   await page.getByText('暂无待派送托盘，请管理员确认 Excel 已导入成功；已签收的托盘不在此列表中。',{exact:true}).waitFor();
   const operator=await browser.newContext();await operator.request.post(base+'/api/login',{data:{username:'browseradmin',pin:'0123'}});
   async function upload(date){const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Dispatch');sheet.getCell('C2').value=date;sheet.getCell('G3').value='BROWSER-SYNC';sheet.getRow(9).values=['1','SYNC-DEALER','1','SYNC-PALLET','ORDER','区','地址','LOAD'];const response=await operator.request.post(base+'/api/import',{multipart:{file:{name:'sync.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await wb.xlsx.writeBuffer())}}});check(response.ok(),'another administrator imported dispatch data');}
   await upload('2026-10-22');
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await page.waitForFunction(()=>document.querySelector('select[aria-label="发货日期"]')?.value==='2026-10-22');check(true,'foreground refresh discovers new data and automatically selects single date');
   await upload('2026-10-23');await page.getByRole('button',{name:'刷新派送数据',exact:true}).click();
   await page.locator('select[aria-label="发货日期"] option[value="2026-10-23"]').waitFor({state:'attached'});check(true,'manual refresh adds imported dates without logging out');
   await page.route('**/api/parcels',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟存储连接失败'})}),{times:1});
   await page.getByRole('button',{name:'刷新派送数据',exact:true}).click();await page.getByRole('alert').filter({hasText:'派送数据加载失败'}).waitFor();check(await page.locator('select[aria-label="发货日期"] option').count()===3,'failed refresh retains previously loaded dates');
   await page.getByRole('button',{name:'刷新派送数据',exact:true}).click();await page.getByRole('alert').filter({hasText:'派送数据加载失败'}).waitFor({state:'hidden'});
   await page.getByRole('button',{name:'签收记录',exact:true}).click();await page.getByRole('heading',{name:'已完成签收',exact:true}).waitFor();await upload('2026-10-24');await page.getByRole('button',{name:'派送工作台',exact:true}).click();
   await page.locator('select[aria-label="发货日期"] option[value="2026-10-24"]').waitFor({state:'attached'});check(true,'returning to workbench refreshes dates');
   const audit=await (await operator.request.get(base+'/api/imports')).json();check(audit.length===3&&audit.every(i=>i.pallet_count===1&&i.pending_count===1),'administrator audit confirms committed rows');await operator.close();
  }
  await page.reload();await dashboard(page);
  await page.getByRole('button',{name:'签收记录',exact:true}).click();await page.getByRole('heading',{name:'已完成签收',exact:true}).waitFor();
  await logout(page);await fillLogin(page,'browseradmin','0123');await submit(page);await dashboard(page);
  await page.getByRole('button',{name:'导入包裹',exact:true}).click();await page.getByRole('heading',{name:'上传包裹信息',exact:true}).waitFor();
  await logout(page);await fillLogin(page,username,'4567');await submit(page);await dashboard(page);check(await page.locator('input[type=file]').count()===0,'previous import view cleared on role switch');
  await logout(page);await fillLogin(page,username,'4567');
  await page.route('**/api/login',route=>route.fulfill({status:502,contentType:'text/html',body:'<html>Bad Gateway</html>'}),{times:1});await submit(page);await page.locator('main [role="alert"]').filter({hasText:'HTTP 502'}).waitFor();check(await page.locator('main [role="alert"]').isVisible(),'gateway errors shown');
  await page.route('**/api/login',route=>route.abort('failed'),{times:1});await submit(page);await page.locator('main [role="alert"]').filter({hasText:'网络连接失败'}).waitFor();check(await page.locator('main [role="alert"]').isVisible(),'network error shown');
  await page.route('**/api/me',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'请先登录'})}),{times:1});await submit(page);await page.locator('main [role="alert"]').filter({hasText:'浏览器未保存会话'}).waitFor();check(await page.locator('main [role="alert"]').isVisible(),'missing session has actionable feedback');
  check(errors.length===0,'no unhandled browser exceptions');await context.close();
 }
 console.log(`PASS: ${checks} browser login assertions (phone and desktop, create user, logout/login role switching, dispatch sync after administrator import, visible validation/loading/network/session feedback).`);
}catch(error){console.error('Application logs:',logs);throw error;}finally{
 await browser?.close();app.kill('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),pause(3000)]);if(app.exitCode===null)app.kill('SIGKILL');await rm(directory,{recursive:true,force:true});
}
