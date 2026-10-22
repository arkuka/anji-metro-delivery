// Report committed business records only, never infer imports from raw files.
export function importSummaries(state){
 const counts=new Map();
 for(const p of state.parcels){if(!p.batch_key)continue;const c=counts.get(p.batch_key)||{pallet_count:0,pending_count:0};c.pallet_count++;if(!p.delivery_id)c.pending_count++;counts.set(p.batch_key,c);}
 return state.imports.map(i=>({batch_key:i.batch_key||null,batch_value:i.batch_value||null,dispatch_date:i.dispatch_date,uploaded_at:i.uploaded_at,uploaded_by:i.uploaded_by,row_count:i.row_count??null,...(i.batch_key?(counts.get(i.batch_key)||{pallet_count:0,pending_count:0}):{pallet_count:null,pending_count:null})})).sort((a,b)=>String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
}
