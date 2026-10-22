import {translate} from './i18n.mjs';
export class ApiError extends Error {
 constructor(message,status=0){super(message);this.name='ApiError';this.status=status;}
}
export async function requestApi(path,body,method,{fetchImpl=globalThis.fetch,timeoutMs=45000}={}){
 let language='zh';try{if(typeof window!=='undefined'&&window.localStorage.getItem('anji-language')==='en')language='en';}catch{}
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const form=body instanceof FormData;
  const response=await fetchImpl('/api/'+path,{method:method||(body?'POST':'GET'),credentials:'same-origin',cache:'no-store',headers:{'Accept-Language':language,...(body&&!form?{'Content-Type':'application/json'}:{})},body:form?body:body?JSON.stringify(body):undefined,signal:controller.signal});
  let value;try{value=await response.json();}catch(error){if(controller.signal.aborted)throw error;throw new ApiError(`服务器返回了无效响应（HTTP ${response.status}），请稍后重试`,response.status);}
  if(value===null||typeof value!=='object')throw new ApiError(`服务器返回了无效响应（HTTP ${response.status}），请稍后重试`,response.status);
  if(!response.ok)throw new ApiError(typeof value?.error==='string'?value.error:`请求失败（HTTP ${response.status}）`,response.status);
  return value;
 }catch(error){
  if(error instanceof ApiError){error.message=translate(error.message,language);throw error;}
  if(controller.signal.aborted)throw new ApiError(translate('请求超时，请检查网络后刷新确认结果',language));
  throw new ApiError(translate('网络连接失败，请检查网络后重试',language));
 }finally{clearTimeout(timeout);}
}
