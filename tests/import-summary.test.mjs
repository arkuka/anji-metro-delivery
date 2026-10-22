import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../lib/storage.mjs';
import {importSummaries} from '../lib/import-summary.mjs';
test('import audit counts committed rows rather than original file row count',()=>{
 const state=emptyState();state.imports=[{batch_key:'key',dispatch_date:'2026-10-22',row_count:99,pathname:'private-file.xlsx',uploaded_at:'2026-10-22T00:00:00Z'},{source:'legacy',dispatch_date:'2026-10-21'}];
 state.parcels=[{batch_key:'key',delivery_id:null},{batch_key:'key',delivery_id:1},{batch_key:'other',delivery_id:null}];
 const audit=importSummaries(state),current=audit.find(i=>i.batch_key==='key');assert.equal(current.pallet_count,2);assert.equal(current.pending_count,1);assert.equal(current.row_count,99);assert(!('pathname' in current));assert.equal(audit.find(i=>i.batch_key===null).pallet_count,null);
});
test('raw uploaded source files alone do not produce successful import records',()=>{
 assert.deepEqual(importSummaries(emptyState()),[]);
});
