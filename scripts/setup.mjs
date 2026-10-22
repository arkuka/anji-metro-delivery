import {getStore} from '../lib/storage.mjs';
const state=await (await getStore()).read();
console.log(`业务存储已就绪：${state.users.length} 个账号；已有账号和密码不会覆盖。`);
