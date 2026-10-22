import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitOrders,receiptOrders,jpegName} from '../lib/orders.mjs';
import {rowsToParcels} from '../lib/domain.mjs';
import {changeParcel,queryParcels} from '../lib/admin-parcels.mjs';
test('one pallet can contain many orders and one order can span pallets',()=>{
 const rows=Array.from({length:8},()=>[]);
 rows.push(['1','D1','','P1','001, 002;003','','','L1']);
 rows.push(['1','D1','','P1','004','','','L1']);
 rows.push(['2','D1','','P2','001','','','L1']);
 const parcels=rowsToParcels(rows);assert.equal(parcels.length,2);
 assert.deepEqual(parcels[0].order_nos,['001','002','003','004']);
 assert.deepEqual(receiptOrders(parcels),['001','002','003','004']);
 assert.throws(()=>rowsToParcels([...rows,['3','D2','','P1','005','','','L1']]),/不一致/);
 assert.deepEqual(splitOrders('001，002；003\n001、004'),['001','002','003','004']);
 assert.equal(jpegName('5AA1269AA2'),'5AA1269AA2.JPG');assert.equal(jpegName('../../x'),'.._.._x.JPG');
});
test('admin metadata edits preserve scan audit and freeze old receipt orders; deletion preserves receipts',()=>{
 const state={parcels:[{id:1,batch_key:'B',dealer:'D1',pallet:'P1',order_no:'O1',load_no:'L',scanned_at:'2026-10-22',delivery_id:1},{id:2,batch_key:'B',dealer:'D1',pallet:'P2',order_no:'O2',load_no:'L',delivery_id:1}],deliveries:[{id:1,pdf_path:'original.pdf'}]};
 changeParcel(state,{id:1,dealer:'D2',pallet:'NEW',order_no:'O3;O4',area:'',address:'',load_no:'L'},'PATCH','admin');
 assert.deepEqual(state.deliveries[0].order_nos,['O1','O2']);assert.equal(state.parcels[0].scanned_at,'2026-10-22');assert.deepEqual(state.parcels[0].order_nos,['O3','O4']);
 assert.equal(queryParcels(state,new URLSearchParams({search:'O4',status:'signed'})).total,1);
 changeParcel(state,{id:1},'DELETE','admin');assert.equal(state.parcels.length,1);assert.equal(state.deliveries[0].pdf_path,'original.pdf');assert.deepEqual(state.deliveries[0].order_nos,['O1','O2']);
});
test('old Chinese and English PDFs recover unique orders after original pallets are removed',async()=>{
 const {makePdf}=await import('../lib/pdf.mjs');const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const {legacyOrders}=await import('../lib/receipt-export.mjs');
 const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
 for(const language of ['zh','en']){
  const bytes=await makePdf('D1',[{pallet:'P1',order_no:'001, 002',load_no:'L1',dispatch_date:'2026-10-22'},{pallet:'P2',order_no:'001',load_no:'L1',dispatch_date:'2026-10-22'}],signature,'driver',new Date('2026-10-22T00:00:00Z'),language);
  const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false});try{assert.deepEqual(await legacyOrders(await task.promise),['001','002']);}finally{await task.destroy();}
 }
});
test('saved PDF font outlines preserve order digits, Latin letters and Chinese characters',async()=>{
 const {makePdf}=await import('../lib/pdf.mjs');const {PDFDocument,PDFName,PDFDict,PDFArray,decodePDFRawStream}=await import('pdf-lib');const fontkit=await import('fontkit');const {readFile}=await import('node:fs/promises');
 const signature='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
 const bytes=await makePdf('D1',[{pallet:'P1',order_no:'5AA1269AA2',load_no:'LOAD1',dispatch_date:'2026-10-22'}],signature,'Driver',new Date(),'zh');
 assert(bytes.length<100000,'receipt embeds a compact font subset');
 const doc=await PDFDocument.load(bytes),fonts=doc.getPages()[0].node.Resources().lookup(PDFName.of('Font'),PDFDict),original=fontkit.create(await readFile(new URL('../public/chinese.ttf',import.meta.url)));
 let checked=0;
 for(const ref of fonts.values()){
  const font=doc.context.lookup(ref,PDFDict),descendant=font.lookup(PDFName.of('DescendantFonts'),PDFArray).lookup(0,PDFDict),descriptor=descendant.lookup(PDFName.of('FontDescriptor'),PDFDict),embedded=fontkit.create(Buffer.from(decodePDFRawStream(descriptor.lookup(PDFName.of('FontFile2'))).decode()));
  const cmap=Buffer.from(decodePDFRawStream(font.lookup(PDFName.of('ToUnicode'))).decode()).toString();
  for(const match of cmap.matchAll(/<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]{4})>/g)){
   const id=parseInt(match[1],16),code=parseInt(match[2],16);if(!id||code===0xffff)continue;
   const actual=embedded.getGlyph(id).path,expected=original.layout(String.fromCodePoint(code)).glyphs[0].path;
   assert.deepEqual(actual.commands.map(c=>c.command),expected.commands.map(c=>c.command),`glyph ${String.fromCodePoint(code)} retains every outline segment`);
   // Subsetting rounds glyph coordinates. Missing outlines or a mismatched CID
   // lose segments or change bounds substantially, unlike minor grid rounding.
   for(const key of ['minX','maxX','minY','maxY'])if(Number.isFinite(expected.bbox[key]))assert(Math.abs(actual.bbox[key]-expected.bbox[key])<50,`glyph ${String.fromCodePoint(code)} has intact ${key}`);checked++;
  }
 }
 assert(checked>30,'verified Latin, numeric and Chinese glyphs from the saved PDF');
});
