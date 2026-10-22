// Keep identifiers as strings, including leading zeros. Spaces inside IDs are preserved.
export function splitOrders(value) {
 const values=Array.isArray(value)?value:[value];
 return [...new Set(values.flatMap(v=>String(v??'').split(/[,，;；、\r\n]+/)).map(s=>s.trim()).filter(Boolean))];
}
export function parcelOrders(parcel){return splitOrders(parcel.order_nos??parcel.order_no??parcel.order);}
export function receiptOrders(rows){return [...new Set(rows.flatMap(parcelOrders))];}
export function jpegName(order){
 const name=String(order).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'');
 return (name||'order')+'.JPG';
}
