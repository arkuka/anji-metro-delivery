import {splitOrders,jpegName} from './orders.mjs';
let pdfModule;
export async function loadPdf(bytes){
 pdfModule??=import('pdfjs-dist/build/pdf.mjs');const pdfjs=await pdfModule;
 pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false});
 const pdf=await task.promise;return {pdf,dispose:()=>task.destroy()};
}
// Legacy records can outlive their imported pallets. Recover IDs from the PDF,
// rather than inventing an ID or silently skipping an older receipt.
export async function legacyOrders(pdf){
 const lines=[];
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),content=await page.getTextContent();const pageLines=new Map();
  for(const item of content.items){if(!item.str)continue;const y=Math.round(item.transform[5]);pageLines.set(y,(pageLines.get(y)||'')+item.str);}
  lines.push(...[...pageLines].sort((a,b)=>b[0]-a[0]).map(([,text])=>text));
 }
 // Joining wrapped PDF lines also handles labels or order IDs split over pages.
 const text=lines.join('');const orders=[];
 for(const match of text.matchAll(/(?:订单号|Order numbers?)\s*[:：]\s*(.*?)\s*\|\s*(?:装车单号|Load number)\s*[:：]/gi))orders.push(match[1]);
 return splitOrders(orders);
}

let repairFont;
async function loadRepairFont(){
 repairFont??=(async()=>{const font=await new FontFace('ReceiptRepair','url(/chinese.ttf)').load();document.fonts.add(font);return font;})();return repairFont;
}
function receiptText(text,language){
 if(language!=='en')return text;
 return text.replaceAll('包裹派送签收证明','Proof of Delivery').replaceAll('发货日期:','Dispatch date:').replaceAll('司机:','Driver:').replaceAll('提交时间 (UTC):','Submitted at (UTC):').replaceAll('托盘:','Pallet:').replaceAll('正常派送','Delivered').replaceAll('派送失败','Delivery failed').replaceAll('订单号:','Order numbers:').replaceAll('装车单号:','Load number:').replaceAll('扫描时间 (UTC):','Scanned at (UTC):').replaceAll('未找到，司机确认','Not found; confirmed by driver').replaceAll('未标注（历史数据）','Undated (legacy record)').replaceAll('客户签名:','Customer signature:');
}
// Older receipts used a broken font subset encoder. Render their original
// images/signature, then replace text using the PDF's correct Unicode mapping.
async function repairLegacyText(page,context,viewport,offset,language){
 const content=await page.getTextContent(),scale=viewport.scale;
 const items=content.items.filter(item=>item.str).map(item=>({item,x:item.transform[4]*scale,y:offset+viewport.height-item.transform[5]*scale,height:Math.hypot(item.transform[2],item.transform[3])*scale}));
 context.fillStyle='white';for(const {y,height}of items)context.fillRect(0,y-height*1.3,context.canvas.width,height*1.9);
 context.fillStyle='#192633';context.textBaseline='alphabetic';
 for(const {item,x,y,height}of items){context.font=`${height}px ReceiptRepair`;context.fillText(receiptText(item.str,language),x,y,context.canvas.width-x-25*scale);}
}
async function renderJpeg(pdf,{legacy=false,language='zh'}={}){
 if(legacy)await loadRepairFont();
 const sizes=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n);sizes.push(page.getViewport({scale:1}));}
 const baseHeight=sizes.reduce((sum,v)=>sum+v.height,0),baseWidth=Math.max(...sizes.map(v=>v.width));
 // Bound canvas memory on phones while retaining all pages and the signature.
 const scale=Math.min(1.7,16000/baseHeight,Math.sqrt(18000000/(baseWidth*baseHeight)));
 if(scale<.65)throw Error('图片过大，请分批下载或下载 PDF');
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(baseWidth*scale);canvas.height=sizes.reduce((s,v)=>s+Math.ceil(v.height*scale),0);
 const context=canvas.getContext('2d');if(!context)throw Error('图片生成失败，请重试或下载 PDF');
 context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
 let y=0;
 try{
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),viewport=page.getViewport({scale});
   // Render into a page-sized canvas first. PDF.js image/alpha-mask paths
   // assume page coordinates; translating a tall target can lose signatures.
   const pageCanvas=document.createElement('canvas');pageCanvas.width=Math.ceil(viewport.width);pageCanvas.height=Math.ceil(viewport.height);
   try{const pageContext=pageCanvas.getContext('2d');await page.render({canvasContext:pageContext,viewport,background:'#ffffff'}).promise;
    if(legacy)await repairLegacyText(page,pageContext,viewport,0,language);
    context.drawImage(pageCanvas,0,y);
   }finally{pageCanvas.width=0;pageCanvas.height=0;}
   y+=Math.ceil(viewport.height);page.cleanup();
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob)throw Error('图片生成失败，请重试或下载 PDF');return blob;
 }finally{canvas.width=0;canvas.height=0;}
}
export function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function combineImages(images){
 if(images.length===1)return images[0];
 const bitmaps=[];try{
  for(const image of images)bitmaps.push(await createImageBitmap(image));
  const width=Math.max(...bitmaps.map(b=>b.width)),height=bitmaps.reduce((s,b)=>s+b.height,0);
  const scale=Math.min(1,16000/height,Math.sqrt(18000000/(width*height)));
  if(scale<.5)throw Error('图片过大，请分批下载或下载 PDF');
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  try{const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);let y=0;for(const b of bitmaps){ctx.drawImage(b,0,y,b.width*scale,b.height*scale);y+=b.height*scale;}const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));if(!blob)throw Error('图片生成失败，请重试或下载 PDF');return blob;}finally{canvas.width=0;canvas.height=0;}
 }finally{bitmaps.forEach(b=>b.close());}
}
export async function exportReceipts(receipts,language,onProgress=()=>{}){
 const {default:JSZip}=await import('jszip');const zip=new JSZip(),groups=new Map(),files=[];
 for(let i=0;i<receipts.length;i++){
  const receipt=receipts[i];onProgress(i+1,receipts.length);
  const response=await fetch(`/api/pdf/${receipt.id}?lang=${language}`,{credentials:'same-origin',cache:'no-store',headers:{'Accept-Language':language}});
  if(!response.ok){let error;try{error=(await response.json()).error;}catch{}throw Error(error||'签收PDF暂时不可用，请联系管理员');}
  const {pdf,dispose}=await loadPdf(await response.arrayBuffer());
  try{
   const orders=splitOrders(receipt.order_nos?.length?receipt.order_nos:await legacyOrders(pdf));
   if(!orders.length)throw Error('无法识别旧 PDF 的订单号，请下载 PDF 核对');
   const image=await renderJpeg(pdf,{legacy:!receipt.has_snapshot,language});
   for(const order of orders){const key=JSON.stringify([receipt.dealer,order]);if(!groups.has(key))groups.set(key,{order,dealer:receipt.dealer,images:[]});groups.get(key).images.push(image);}
  }finally{await dispose();}
 }
 const names=new Set();
 for(const group of groups.values()){
  const image=await combineImages(group.images);let name=jpegName(group.order);
  // Different dealers or filesystem-unsafe IDs must never overwrite one another.
  if(names.has(name.toLowerCase())){const folder=jpegName(group.dealer).slice(0,-4);let prefix=folder,index=2;while(names.has(`${prefix}/${name}`.toLowerCase()))prefix=folder+'-'+index++;name=prefix+'/'+name;}
  names.add(name.toLowerCase());files.push({name,image});zip.file(name,await image.arrayBuffer());
 }
 if(files.length===1)saveBlob(files[0].image,files[0].name);
 else saveBlob(await zip.generateAsync({type:'blob',compression:'STORE'}),'delivery-orders.zip');
 return files.length;
}
