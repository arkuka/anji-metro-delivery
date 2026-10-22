import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
// Calendar dates are stored as YYYY-MM-DD without timezone conversion.
export function parseDispatchDate(value, date1904 = false) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const day = Math.floor(value);
    if (day < (date1904 ? 0 : 1) || day > 2958465 || (!date1904 && day === 60)) throw Error('Excel C2 发货日期无效');
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
    return parseDispatchDate(new Date(epoch + (day - (!date1904 && day > 60 ? 1 : 0)) * 86400000));
  }
  const text = String(value ?? '').trim().replace(/^发货日期\s*[:：]?\s*/, '');
  let m = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  throw Error('Excel C2 必须填写发货日期，例如 2026-10-22 或 22/10/2026');
}
function validDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) throw Error('Excel C2 发货日期无效');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function pinHash(pin) { if(!/^\d{4}$/.test(pin)) throw Error('密码必须是4位数字'); const salt=randomBytes(16).toString('hex'); return salt+':'+scryptSync(pin,salt,64).toString('hex'); }
export function pinVerify(pin,hash) { if(!/^\d{4}$/.test(pin))return false; const [salt,key]=hash.split(':'); return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(pin,salt,64)); }
export function filename(dealer,date=new Date(),tz='Australia/Sydney'){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x=>[x.type,x.value]));return `${p.year}${p.month}${p.day}-${p.hour}:${p.minute}:${p.second}-${dealer.replace(/[^\p{L}\p{N}_-]/gu,'_')}.PDF`;}
export function rowsToParcels(rows){const result=[]; const seen=new Set();for(let i=8;i<rows.length;i++){let r=rows[i].map(v=>String(v??'').trim());if(r.every(x=>!x))continue;let [sequence,dealer,count,pallet,order,area,address,load]=r;if(!dealer||!pallet||!order||!load)throw Error(`第${i+1}行缺少Dealer、托盘号、订单号或装车单号`);const key=JSON.stringify([load,pallet]);if(seen.has(key))throw Error(`第${i+1}行托盘重复`);seen.add(key);result.push({sequence,dealer,count,pallet,order,area,address,load});}if(!result.length)throw Error('第9行起没有包裹数据');return result;}
