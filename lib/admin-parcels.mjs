import {AppError} from './storage.mjs';
import {splitOrders,receiptOrders} from './orders.mjs';
export function queryParcels(state,params){
 const search=(params.get('search')||'').trim().toLowerCase(),date=params.get('date'),status=params.get('status');
 const rows=state.parcels.filter(p=>(!date||(p.dispatch_date||'undated')===date)&&(!status||(status==='signed'?!!p.delivery_id:status==='scanned'?!!p.scanned_at&&!p.delivery_id:!p.scanned_at&&!p.delivery_id))&&(!search||[p.dealer,p.pallet,p.order_no,p.load_no,p.address,p.batch_value].some(v=>String(v||'').toLowerCase().includes(search)))).sort((a,b)=>b.id-a.id);
 const page=Math.max(1,Math.min(Math.ceil(rows.length/50)||1,Number.parseInt(params.get('page'),10)||1));
 return {rows:rows.slice((page-1)*50,page*50),total:rows.length,page,pages:Math.ceil(rows.length/50)||1,dates:[...new Set(state.parcels.map(p=>p.dispatch_date||'undated'))].sort().reverse()};
}
export function changeParcel(state,body,method,username){
 const p=state.parcels.find(p=>p.id===Number(body.id));if(!p)throw new AppError('托盘不存在',404);
 // Freeze order associations on older receipts before modifying their source rows.
 if(p.delivery_id){const d=state.deliveries.find(d=>d.id===p.delivery_id);if(d&&!d.order_nos)d.order_nos=receiptOrders(state.parcels.filter(p=>p.delivery_id===d.id));}
 if(method==='DELETE'){state.parcels=state.parcels.filter(r=>r.id!==p.id);return {ok:true};}
 const fields=['dealer','pallet','area','address','load_no'];const update={};
 for(const key of fields){if(typeof body[key]!=='string'||body[key].trim().length>500)throw new AppError('托盘信息无效');update[key]=body[key].trim();}
 const orders=splitOrders(body.order_nos??body.order_no);if(!update.dealer||!update.pallet||!update.load_no||!orders.length||orders.length>200||orders.some(o=>o.length>100))throw new AppError('请填写Dealer、托盘号、订单号和装车单号');
 if(state.parcels.some(r=>r.id!==p.id&&r.batch_key===p.batch_key&&r.load_no===update.load_no&&r.pallet===update.pallet))throw new AppError('该批次中托盘号和装车单号重复');
 Object.assign(p,update,{order_no:orders.join(', '),order_nos:orders,updated_at:new Date().toISOString(),updated_by:username});return {ok:true};
}
