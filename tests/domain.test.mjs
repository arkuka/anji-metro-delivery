import {test} from 'node:test';import assert from 'node:assert/strict';import {pinHash,pinVerify,rowsToParcels,filename} from '../lib/domain.mjs';
test('PIN validation, hashing and verification',()=>{const h=pinHash('0123');assert(pinVerify('0123',h));assert(!pinVerify('1234',h));assert.throws(()=>pinHash('12345'));assert.notEqual(h,pinHash('0123'));});
test('Excel starts at row 9, preserves leading zeros, rejects invalid and duplicate pallets',()=>{const r=Array.from({length:8},()=>['ignored']);r.push(['1','001','2','0002','0003','东区','地址','L1']);assert.equal(rowsToParcels(r)[0].dealer,'001');assert.throws(()=>rowsToParcels([...r,r[8]]));assert.throws(()=>rowsToParcels([...r,['2','','','P','','','','']]));});
test('PDF filename uses configured timezone and required format',()=>{assert.equal(filename('D01',new Date('2026-01-01T00:00:00Z'),'UTC'),'20260101-00:00:00-D01.PDF');});

test('dispatch dates support Excel dates, serials, 1904 system and day-first text',async()=>{
 const {parseDispatchDate}=await import('../lib/domain.mjs');
 assert.equal(parseDispatchDate(new Date('2026-10-22T00:00:00Z')),'2026-10-22');
 assert.equal(parseDispatchDate('22/10/2026'),'2026-10-22');
 assert.equal(parseDispatchDate('2026年10月22日'),'2026-10-22');
 assert.equal(parseDispatchDate('发货日期：2026-10-22'),'2026-10-22');
 assert.equal(parseDispatchDate(25569),'1970-01-01');
 assert.equal(parseDispatchDate(0,true),'1904-01-01');
 assert.equal(parseDispatchDate('03/04/2026'),'2026-04-03');
 assert.equal(parseDispatchDate('29/02/2024'),'2024-02-29');
 for(const v of ['',null,'2026-02-30','29/02/2026','2026-13-01',60,NaN])assert.throws(()=>parseDispatchDate(v));
});
