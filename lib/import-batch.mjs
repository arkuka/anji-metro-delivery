import {parseDispatchDate,ValidationError} from './domain.mjs';

export function importBatchIdentity(dateValue,g3Value,date1904=false){
  const dispatchDate=parseDispatchDate(dateValue,date1904);
  const batchValue=String(g3Value??'').trim();
  if(!batchValue)throw new ValidationError('Excel G3 不能为空，请填写导入批次标识');
  // Structured encoding avoids ambiguous concatenations and preserves G3 case/zeros.
  return {dispatchDate,batchValue,batchKey:JSON.stringify([dispatchDate,batchValue])};
}

// Run only inside the store's CAS transaction: remove the complete old batch and
// add the complete new batch in the same state commit, including on conflicts.
export function replaceImportBatch(state,{dispatchDate,batchValue,batchKey,parcels,source,sourcePath,username}){
  const removed=state.parcels.filter(p=>p.batch_key===batchKey).length;
  const retained=state.parcels.filter(p=>p.batch_key!==batchKey);
  const legacyUnkeyed=retained.filter(p=>!p.batch_key&&p.dispatch_date===dispatchDate).length;
  const added=parcels.map(p=>({id:++state.counters.parcels,sequence:p.sequence,dealer:p.dealer,pallet:p.pallet,order_no:p.order,area:p.area,address:p.address,load_no:p.load,dispatch_date:dispatchDate,batch_key:batchKey,batch_value:batchValue,scanned_at:null,driver_id:null,scanner_name:null,delivery_id:null}));
  state.parcels=[...retained,...added];
  state.imports=state.imports.filter(i=>i.batch_key!==batchKey);
  state.imports.push({batch_key:batchKey,batch_value:batchValue,source,pathname:sourcePath,dispatch_date:dispatchDate,row_count:added.length,uploaded_by:username,uploaded_at:new Date().toISOString()});
  return {dispatchDate,batchValue,batchKey,removed,inserted:added.length,legacyUnkeyed};
}
