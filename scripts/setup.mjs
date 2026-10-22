import {schema} from '../lib/db.mjs';
import pg from 'pg';
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,connectionTimeoutMillis:15000});
import {pinHash} from '../lib/domain.mjs';
if(!process.env.DATABASE_URL||!process.env.ADMIN_PIN)throw Error('请安全设置 DATABASE_URL 和 ADMIN_PIN（4位数字）');
try{await pool.query(schema);await pool.query("INSERT INTO users(username,password,role) VALUES($1,$2,'admin') ON CONFLICT(username) DO NOTHING",[process.env.ADMIN_USERNAME||'admin',pinHash(process.env.ADMIN_PIN)]);console.log('数据库及初始管理员已就绪（已有密码不会覆盖）');}finally{await pool.end();}
