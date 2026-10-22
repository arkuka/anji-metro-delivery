import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../lib/storage.mjs';
import {importBatchIdentity,replaceImportBatch} from '../lib/import-batch.mjs';
const parcel={sequence:'1',dealer:'D1',pallet:'P1',order:'O1',area:'东区',address:'地址',load:'L1'};
function batch(g3='001',date='2026-10-22',parcels=[parcel]){return {...importBatchIdentity(date,g3),parcels,source:'hash',sourcePath:'imports/hash/source.xlsx',username:'admin'};}
test('C2 date is normalized and G3 preserves meaningful text and leading zeros',()=>{
 assert.equal(importBatchIdentity('22/10/2026',' 001 ').batchKey,importBatchIdentity('2026-10-22','001').batchKey);
 assert.notEqual(importBatchIdentity('2026-10-22','001').batchKey,importBatchIdentity('2026-10-22','1').batchKey);
 assert.notEqual(importBatchIdentity('2026-10-22','A|B').batchKey,importBatchIdentity('2026-10-23','A|B').batchKey);
 for(const g3 of [null,'','   '])assert.throws(()=>importBatchIdentity('2026-10-22',g3));
});
test('same KEY replaces all old pallets and scan state; different keys and receipts remain',()=>{
 const state=emptyState();replaceImportBatch(state,batch());const oldId=state.parcels[0].id;
 state.parcels[0].scanned_at='2026-10-22T00:00:00Z';state.parcels[0].delivery_id=1;
 state.deliveries.push({id:1,pdf_path:'receipt.pdf'});
 replaceImportBatch(state,batch('002'));replaceImportBatch(state,batch('001','2026-10-23'));
 const otherIds=state.parcels.filter(p=>p.id!==oldId).map(p=>p.id);
 const result=replaceImportBatch(state,batch('001','2026-10-22',[{...parcel,pallet:'P2'},{...parcel,pallet:'P3'}]));
 assert.equal(result.removed,1);assert.equal(result.inserted,2);assert(!state.parcels.some(p=>p.id===oldId));
 assert.deepEqual(state.parcels.filter(p=>otherIds.includes(p.id)).map(p=>p.id),otherIds);
 const fresh=state.parcels.filter(p=>p.batch_key===result.batchKey);assert.equal(fresh.length,2);assert(fresh.every(p=>p.scanned_at===null&&p.delivery_id===null&&p.scanner_name===null));
 assert.equal(state.imports.length,3);assert.equal(state.deliveries[0].pdf_path,'receipt.pdf');
});
test('unknown historical batch ownership is retained and reported, never guessed',()=>{
 const state=emptyState();state.parcels.push({id:1,dispatch_date:'2026-10-22',pallet:'P1'});state.counters.parcels=1;
 const result=replaceImportBatch(state,batch());assert.equal(result.legacyUnkeyed,1);assert.equal(state.parcels.length,2);
});
