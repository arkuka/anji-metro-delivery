'use client';
import {useState,useEffect,useRef} from 'react';
import Localized from './components/Localized';
import PalletAdmin from './components/PalletAdmin';
import ReceiptHistory from './components/ReceiptHistory';
import {translate} from '../lib/i18n.mjs';
import {parcelOrders} from '../lib/orders.mjs';
import SignaturePad from './components/SignaturePad';
import VersionInfo from './components/VersionInfo';
import {requestApi,ApiError} from '../lib/client-api.mjs';
export default function Home(){const [language,setLanguage]=useState('zh'),[scanFeedback,setScanFeedback]=useState(null);const scanLock=useRef(false),scanHandler=useRef();const t=text=>translate(text,language);
function switchLanguage(value){setLanguage(value);try{localStorage.setItem('anji-language',value);}catch{}}
useEffect(()=>{try{setLanguage(localStorage.getItem('anji-language')==='en'?'en':'zh');}catch{}},[]);
useEffect(()=>{document.documentElement.lang=language==='en'?'en':'zh-CN';document.title=language==='en'?'ANJI Delivery':'ANJI 派送管理';},[language]);
const languageControl=<label className="language-switch"><span className="sr-only">{t('选择语言')}</span><select aria-label={t('选择语言')} value={language} onChange={e=>switchLanguage(e.target.value)}><option value="zh">中文</option><option value="en">English</option></select></label>;
const [me,M]=useState(null),[ready,R]=useState(false),[tab,T]=useState('派送工作台'),[parcels,P]=useState([]),[dealer,D]=useState(''),[dispatchDate,DD]=useState(''),[scan,S]=useState(''),[msg,G]=useState(''),[users,U]=useState([]),[history,H]=useState([]),[sign,Q]=useState(false),[busy,B]=useState(false),[tabLoading,LT]=useState(false),[syncing,LS]=useState(false),[syncError,SE]=useState(''),[dataLoaded,DL]=useState(false),[lastSync,LAST]=useState(''),[imports,I]=useState([]),[camera,C]=useState(false);const canvas=useRef(),dialog=useRef(),video=useRef(),controls=useRef(),epoch=useRef(0),syncId=useRef(0),syncActive=useRef(false),view=useRef();
view.current={me,tab,busy,sign,camera};
function resetSession(){setScanFeedback(null);epoch.current++;syncId.current++;syncActive.current=false;LS(false);SE('');DL(false);LAST('');I([]);LT(false);M(null);P([]);U([]);H([]);T('派送工作台');D('');DD('');S('');Q(false);C(false);}
async function api(path,body,method){try{return await requestApi(path,body,method);}catch(error){if(error.status===401&&me)resetSession();throw error;}}
async function login(credentials){
 const username=String(credentials.username||'').trim(),pin=String(credentials.pin||'');
 if(!username)throw Error('请输入用户名');if(!/^\d{4}$/.test(pin))throw Error('密码必须是4位数字');
 await api('login',{username,pin});
 let user;
 try{user=await api('me');}catch(error){if(error.status===401)throw new ApiError('登录请求成功，但浏览器未保存会话。请允许Cookie，并从同一个网址登录',401);throw error;}
 // Never carry navigation or account-scoped data into the next user's session.
 resetSession();M(user);
}
async function act(fn){B(true);G('');try{await fn();}catch(e){G(e.message);}finally{B(false);}}
async function refresh(){
 const current=++syncId.current,session=epoch.current;syncActive.current=true;LS(true);SE('');
 try{const parcels=await requestApi('parcels');if(session===epoch.current&&current===syncId.current){P(parcels);DL(true);LAST(new Date().toISOString());}return parcels;}
 catch(error){if(session===epoch.current&&current===syncId.current){if(error.status===401){resetSession();G('登录已过期，请重新登录');}else SE(error.message);}throw error;}
 finally{if(session===epoch.current&&current===syncId.current){syncActive.current=false;LS(false);}}
}
useEffect(()=>{
 let cancelled=false;
 (async()=>{try{const user=await requestApi('me');if(cancelled)return;M(user);}catch(error){if(!cancelled&&error.status!==401)G(error.message);}finally{if(!cancelled)R(true);}})();
 return()=>{cancelled=true;controls.current?.stop();};
},[]);
useEffect(()=>{
 LT(false);if(!me)return;
 if(tab==='用户管理'&&me.role!=='admin'){T('派送工作台');return;}
 if(tab!=='用户管理'&&tab!=='签收记录'&&!(tab==='导入包裹'&&me.role==='admin'))return;
 let cancelled=false;LT(true);G('');
 (async()=>{try{const result=await api(tab==='用户管理'?'users':tab==='导入包裹'?'imports':'deliveries');if(!cancelled){if(tab==='用户管理')U(result);else if(tab==='导入包裹')I(result);else H(result);}}catch(error){if(!cancelled)G(error.message);}finally{if(!cancelled)LT(false);}})();
 return()=>{cancelled=true;};
},[tab,me?.id,me?.role]);
useEffect(()=>{
 if(!me||tab!=='派送工作台')return;
 const update=()=>{const state=view.current;if(document.visibilityState==='hidden'||!state.me||state.tab!=='派送工作台'||state.busy||state.sign||state.camera||syncActive.current)return;refresh().catch(()=>{});};
 refresh().catch(()=>{});const timer=setInterval(update,60000);
 window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
 return()=>{clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
},[me?.id,tab]);
useEffect(()=>{if(!camera)return;let disposed=false;import('@zxing/browser').then(async({BrowserMultiFormatReader})=>{try{const c=await new BrowserMultiFormatReader().decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'}}},video.current,(result)=>{if(result&&!disposed){disposed=true;const value=result.getText();S(value);C(false);controls.current?.stop();scanHandler.current?.(value);}});if(disposed)c.stop();else controls.current=c;}catch(e){G('无法打开摄像头，请允许权限或使用扫码枪 / 手动输入');C(false);}});return()=>{disposed=true;controls.current?.stop();};},[camera]);
useEffect(()=>{if(!sign)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';dialog.current?.showModal();return()=>{document.body.style.overflow=previous;};},[sign]);
useEffect(()=>{C(false);},[tab]);
const dates=[...new Set(parcels.map(p=>p.dispatch_date||'undated'))].sort().reverse();const dated=parcels.filter(p=>(p.dispatch_date||'undated')===dispatchDate);const selected=dated.filter(p=>p.dealer===dealer);const done=selected.filter(p=>p.scanned_at).length;const dealers=[...new Set(dated.map(p=>p.dealer))];
useEffect(()=>{
 if(sign||!dataLoaded)return;
 if(dispatchDate&&!dates.includes(dispatchDate)){DD('');D('');S('');C(false);}
 else if(!dispatchDate&&dates.length===1)DD(dates[0]);
 if(dealer&&!dated.some(p=>p.dealer===dealer)){D('');S('');C(false);}
},[parcels,dispatchDate,dealer,sign,dataLoaded]);
const overview=dispatchDate?dated:parcels;
async function scanValue(value){
 if(scanLock.current)return;scanLock.current=true;setScanFeedback(null);
 try{await act(async()=>{
  if(!dealer||!dispatchDate)throw Error('请先选择发货日期和 Dealer');
  const number=value.trim();let matches=selected.filter(p=>p.pallet===number);
  if(!matches.length)matches=selected.filter(p=>parcelOrders(p).includes(number));
  if(matches.length!==1){const other=parcels.find(p=>p.pallet===number&&p.dealer!==dealer);throw Error(matches.length?'此订单对应多个托盘，请扫描托盘号':other?`托盘属于 Dealer ${other.dealer}，不属于当前选择的 Dealer`:'该编号不属于所选Dealer');}
  if(matches[0].scanned_at)throw Error('此托盘已经扫描');
  try{await api('scan',{id:matches[0].id,dealer,dispatchDate});}catch(error){setScanFeedback({error:true,text:error.message});throw error;}
  S('');setScanFeedback({error:false,text:'托盘扫描成功'});await refresh();
  if(done+1===selected.length){G('该Dealer的货已经全部扫描，请客户签字后提交。');Q(true);}
 });}finally{scanLock.current=false;}
}
scanHandler.current=async value=>{ // Used by camera and manual/USB scanners.
 const number=value.trim();let matches=selected.filter(p=>p.pallet===number);if(!matches.length)matches=selected.filter(p=>parcelOrders(p).includes(number));
 if(matches.length!==1||matches[0]?.scanned_at){const other=parcels.find(p=>p.pallet===number&&p.dealer!==dealer);const text=matches.length>1?'此订单对应多个托盘，请扫描托盘号':matches[0]?.scanned_at?'此托盘已经扫描':other?`托盘属于 Dealer ${other.dealer}，不属于当前选择的 Dealer`:'该编号不属于所选Dealer';setScanFeedback({error:true,text});navigator.vibrate?.(150);return;}
 await scanValue(value);
};
async function scanNow(e){e.preventDefault();await scanHandler.current(scan);}
if(!ready)return <Localized language={language}><main><p>正在加载…</p></main></Localized>;
if(!me)return <Localized language={language}><main className="login"><div className="brand">ANJI <span>DELIVERY</span></div>{languageControl}<h1>派送，每一托都有记录。</h1><p className="muted">登录以开始扫描与客户签收</p><form noValidate aria-busy={busy} onSubmit={e=>{e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);act(()=>login(Object.fromEntries(f)));}}><label>用户名<input name="username" autoCapitalize="none" autoCorrect="off" autoComplete="username" enterKeyHint="next" required/></label><label>4位数字密码<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="current-password" required/></label><button disabled={busy}>{busy?'正在登录…':'登录工作台 →'}</button></form>{msg&&<p className="notice" role="alert">{msg}</p>}<VersionInfo language={language}/></main></Localized>;
return <Localized language={language}><><header><div className="brand">ANJI <span>DELIVERY</span></div>{languageControl}<span className="account-name"><span translate="no">{me.username}</span> · {me.role==='admin'?'管理员':'司机'}</span><button className="quiet" onClick={()=>act(async()=>{await api('logout',{});resetSession();})}>退出</button></header><div className="shell"><aside aria-label="功能导航"><small>配送管理</small>{['派送工作台','签收记录',...(me.role==='admin'?['导入包裹','托盘管理','用户管理']:[]),'修改密码'].map(t=><button className={tab===t?'active':'quiet'} key={t} aria-label={t} aria-current={tab===t?'page':undefined} data-short-label={{'派送工作台':'派送','签收记录':'记录','导入包裹':'导入','用户管理':'用户','托盘管理':'托盘','修改密码':'密码'}[t]} onClick={()=>{T(t);G('');}}><span className="nav-label">{translate(t,language)}</span></button>)}<div className="asideNote">扫描 · 确认 · 签收<br/>让每次交付有据可查</div></aside><main><div className="eyebrow">DELIVERY OPERATIONS</div><h1>{t(tab)}</h1><p className="muted">{tab==='派送工作台'?'先选择发货日期，再选择收货商，扫描托盘并完成电子签收。':'管理您的派送数据与账号。'}</p><VersionInfo language={language}/>{msg&&<div className="notice" role="status">{msg}</div>}{tabLoading&&<p className="muted" role="status">正在加载…</p>}
{tab==='派送工作台'&&<><div className="dispatch-sync"><div><b>派送数据</b><small>{lastSync?'上次同步：'+new Date(lastSync).toLocaleTimeString():'尚未完成同步'} · 返回页面时自动刷新</small></div><button className="secondary" disabled={syncing} onClick={()=>refresh().catch(()=>{})}>{syncing?'正在同步…':'刷新派送数据'}</button></div>{syncError&&<p className="notice" role="alert">派送数据加载失败：{syncError}。请点击刷新重试；暂不据此判断是否有待派送托盘。</p>}<div className="stats"><article><small>待派送 Dealer</small><strong>{dataLoaded?new Set(overview.map(p=>p.dealer)).size:'—'}</strong></article><article><small>待提交托盘</small><strong>{dataLoaded?overview.length:'—'}</strong></article><article><small>当前扫描进度</small><strong>{done}<em> / {selected.length}</em></strong></article></div><section><h2>01 <span>选择发货日期</span></h2><select aria-label="发货日期" value={dispatchDate} onChange={e=>{setScanFeedback(null);DD(e.target.value);D('');Q(false);S('');C(false);}}><option value="">{!dataLoaded?(syncError?'加载失败，请刷新':'正在加载发货日期…'):'请选择发货日期'}</option>{dates.map(d=><option key={d} value={d}>{d==='undated'?'未标注日期（历史数据）':d}</option>)}</select>{dispatchDate==='undated'&&<p className="muted">历史数据没有发货日期，请核对批次后操作。</p>}</section>{dispatchDate&&<section><h2>02 <span>选择 Dealer</span></h2><select aria-label="Dealer ID" value={dealer} onChange={e=>{setScanFeedback(null);D(e.target.value);Q(false);S('');C(false);}}><option value="">请选择 Dealer ID</option>{dealers.map(d=><option key={d}>{d}</option>)}</select>{selected.length>0&&<p className="muted"><span translate="no">{selected[0].area}</span> · <span translate="no">{selected[0].address}</span></p>}</section>}{dealer&&<><section><h2>03 <span>扫描托盘</span><small>{done} / {selected.length} 已扫描</small></h2><form className="inline scan-form" onSubmit={scanNow}><input aria-label="托盘号或订单号" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder="扫描或输入托盘号 / 订单号" value={scan} onChange={e=>{S(e.target.value);setScanFeedback(null);}} required/><button className="scan-confirm" disabled={busy||!scan.trim()}>确认扫描</button><button type="button" className="secondary camera-button" onClick={()=>C(!camera)}>{camera?'关闭相机':'打开相机扫码'}</button></form>{scanFeedback&&<p className={scanFeedback.error?'notice scan-error':'notice'} role={scanFeedback.error?'alert':'status'} aria-live="assertive">{t(scanFeedback.text)}</p>}{camera&&<div className="camera-panel"><video ref={video} autoPlay muted playsInline/><p>将托盘条码对准镜头，识别后自动确认</p></div>}<div className="scan-progress"><span>已扫描 {done} / {selected.length} 个托盘</span><progress aria-label="托盘扫描进度" max={selected.length||1} value={done}/></div><div className="table"><table><thead><tr><th>托盘号</th><th>订单号</th><th>装车单号</th><th>状态 / 扫描时间</th></tr></thead><tbody>{selected.map(p=><tr key={p.id}><td data-label="托盘号" className="pallet-number"><span translate="no">{p.pallet}</span></td><td data-label="订单号"><span translate="no">{p.order_no}</span></td><td data-label="装车单号"><span translate="no">{p.load_no}</span></td><td data-label="派送状态"><span className={p.scanned_at?'badge good':'badge'}>{p.scanned_at?'已扫描':'待扫描'}</span>{p.scanned_at&&<small>{new Date(p.scanned_at).toLocaleString()} · <span translate="no">{p.driver_name}</span></small>}</td></tr>)}</tbody></table></div></section><section className="signoff-section"><h2>04 <span>客户签收</span></h2><p className="muted">所有托盘扫描后签收；无法找到的托盘将标记为派送失败。</p><button disabled={busy} onClick={()=>{Q(true);}}>开始客户签名</button></section></>}{!dataLoaded&&!syncError&&<section className="empty">正在读取已保存的派送数据…</section>}{dataLoaded&&!syncError&&!parcels.length&&<section className="empty">暂无待派送托盘，请管理员确认 Excel 已导入成功；已签收的托盘不在此列表中。</section>}</>}
{tab==='导入包裹'&&me.role==='admin'&&<><section><h2>上传包裹信息</h2><p>支持 .xlsx，最大 4MB。读取第一个工作表，C2 为发货日期，G3 为批次标识，包裹从第9行开始。</p><p className="muted">A–H：托盘序号、Dealer ID、托盘个数、托盘号、订单号、区、地址、装车单号。以 C2 发货日期 + G3 组合为批次 KEY。上传同一 KEY 会整批删除旧托盘并替换为新数据，包括重置原扫描和派送状态；其他 KEY 不受影响，历史签收 PDF 保留。</p><p className="muted">多个订单用逗号、分号或换行分隔；同一托盘也可在多行列出不同订单。</p><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act(async()=>{const v=await api('import',f);const success=`批次 ${v.dispatchDate} / ${v.batchValue} 已保存成功：删除旧托盘 ${v.removed} 条，导入新托盘 ${v.inserted} 条。${v.legacyUnkeyed?' 注意：同日期另有 '+v.legacyUnkeyed+' 条旧记录未保存G3，无法自动匹配，已保留。':''}`;G(success);try{await refresh();I(await api('imports'));}catch(error){G(success+' 列表刷新失败：'+error.message);}});}}><input type="file" name="file" accept=".xlsx" required/><button disabled={busy}>{busy?'正在校验并保存…':'上传并导入'}</button></form></section><section><h2>已成功保存的导入批次</h2><p className="muted">这里列出已保存的托盘记录，可用于核对司机端数据。</p>{imports.length?imports.map((i,n)=><div className="record" key={i.batch_key||n}><div><b>{i.dispatch_date} · {i.batch_value||'历史批次'}</b><small>已保存托盘：{i.pallet_count??'无法核对'} · 待派送：{i.pending_count??'无法核对'}</small><small>{i.uploaded_at?new Date(i.uploaded_at).toLocaleString():''} · <span translate="no">{i.uploaded_by}</span></small></div></div>):!tabLoading&&<p className="muted">暂无成功保存的导入批次。请上传 Excel，并确认出现保存成功及托盘条数。</p>}</section></>}
{tab==='托盘管理'&&me.role==='admin'&&<PalletAdmin api={api} language={language} onChanged={()=>refresh().catch(()=>{})}/>}
{tab==='签收记录'&&<ReceiptHistory history={history} admin={me.role==='admin'} language={language}/>}
{tab==='修改密码'&&<section><h2>修改自己的密码</h2><form onSubmit={e=>{e.preventDefault();const f=e.currentTarget;act(async()=>{await api('password',Object.fromEntries(new FormData(f)));f.reset();G('密码已更新');});}}><label>原密码<input name="oldPin" type="password" maxLength={4} pattern="[0-9]{4}" inputMode="numeric" required/></label><label>新密码<input name="pin" type="password" maxLength={4} pattern="[0-9]{4}" inputMode="numeric" required/></label><button disabled={busy}>保存密码</button></form></section>}
{tab==='用户管理'&&me.role==='admin'&&<><section><h2>新增用户</h2><form className="inline" onSubmit={e=>{e.preventDefault();const f=e.currentTarget;act(async()=>{await api('users',Object.fromEntries(new FormData(f)));U(await api('users'));f.reset();G('用户已创建');});}}><input name="username" autoCapitalize="none" autoCorrect="off" autoComplete="off" placeholder="用户名" required/><input name="pin" aria-label="新用户密码" inputMode="numeric" maxLength={4} placeholder="4位数字密码" type="password" pattern="[0-9]{4}" required/><select name="role"><option value="driver">普通用户 / 司机</option><option value="admin">管理员</option></select><button disabled={busy}>新增</button></form></section><section><h2>用户列表</h2>{users.map(u=><div className="record" key={u.id}><div><b><span translate="no">{u.username}</span></b><small>{u.role==='admin'?'管理员':'司机'}</small></div>{u.id!==me.id&&<div><button className="quiet" disabled={busy} onClick={()=>{const pin=prompt(t('输入新的4位数字密码'));if(pin!==null)act(async()=>{await api('users',{id:u.id,pin},'PATCH');G('密码已重置');});}}>重置密码</button><button className="quiet danger" disabled={busy} onClick={()=>{if(confirm(t('确定删除用户 '+u.username+'？')))act(async()=>{await api('users',{id:u.id},'DELETE');U(await api('users'));});}}>删除</button></div>}</div>)}</section></>}
</main></div>{sign&&<dialog ref={dialog} className="signature-dialog" aria-labelledby="signature-title" onCancel={e=>{e.preventDefault();if(!busy)Q(false);}}><section className="modal"><h2 id="signature-title">客户签名 · {dispatchDate==='undated'?'未标注日期':dispatchDate} · {dealer}</h2><p>{done===selected.length?'该Dealer的货已经全部扫描。':'注意：仍有 '+(selected.length-done)+' 个托盘未扫描，将记录为派送失败。'}</p><p className="muted">请客户用手指在下方签名。提交后记录锁定并保存 PDF。</p><SignaturePad ref={canvas} language={language}/><div className="inline modal-actions"><button type="button" disabled={busy} className="quiet" onClick={()=>canvas.current.clear()}>清除签名</button><button type="button" disabled={busy} className="quiet" onClick={()=>Q(false)}>取消</button><button disabled={busy} onClick={()=>act(async()=>{if(!canvas.current.hasInk())throw Error('请客户先签名');const missing=done<selected.length;if(missing&&!confirm(t(`确认 ${selected.length-done} 个托盘无法找到，并以派送失败提交？`)))return;const v=await api('submit',{language,dealer,dispatchDate,ids:selected.map(p=>p.id),confirmMissing:missing,signature:canvas.current.toDataURL('image/png')});Q(false);D('');await refresh();G('签收成功，PDF已保存：'+v.filename);})}>确认并保存 PDF</button></div>{msg&&<p role="alert">{msg}</p>}</section></dialog>}</></Localized>;
}
