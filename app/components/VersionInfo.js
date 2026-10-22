import Localized from './Localized';
const version=process.env.NEXT_PUBLIC_APP_VERSION;
const commit=process.env.NEXT_PUBLIC_APP_COMMIT;
const updatedAt=process.env.NEXT_PUBLIC_APP_UPDATED_AT;
const updatedLabel=updatedAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(updatedAt)):'';
export default function VersionInfo({language='zh'}){
 return <Localized language={language}><div className="system-version" aria-label="系统版本信息">
  <span>系统版本：v{version}{commit&&<span className="build-commit"> · {commit}</span>}</span>
  {updatedAt&&<span title="当前部署的构建时间，不是包裹数据更新时间">更新时间：<time dateTime={updatedAt}>{updatedLabel}</time>（悉尼）</span>}
 </div></Localized>;
}
