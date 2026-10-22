// Next may construct req.url with its bind address (0.0.0.0). The Host header
// identifies the browser-facing origin; forwarded protocol handles Vercel HTTPS.
export function hasAllowedOrigin(request){
 const origin=request.headers.get('origin');if(!origin)return true;
 try{
  const url=new URL(request.url);
  const protocol=(request.headers.get('x-forwarded-proto')||url.protocol.slice(0,-1)).split(',')[0].trim();
  if(!['http','https'].includes(protocol))return false;
  const host=request.headers.get('host')||url.host;
  return new URL(origin).origin===new URL(`${protocol}://${host}`).origin;
 }catch{return false;}
}
