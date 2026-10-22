import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const {version}=JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8'));
let commit=process.env.VERCEL_GIT_COMMIT_SHA||'';
if(!commit){try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}}
export default {
 outputFileTracingIncludes:{'/api/**/*':['./public/chinese.otf']},
 env:{
  NEXT_PUBLIC_APP_VERSION:version,
  NEXT_PUBLIC_APP_COMMIT:commit.slice(0,7),
  NEXT_PUBLIC_APP_UPDATED_AT:new Date().toISOString(),
 },
};
