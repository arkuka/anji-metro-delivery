import pg from 'pg';
import {schema} from '../lib/db.mjs';
const connectionString=process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if(!connectionString)throw Error('请设置 DATABASE_URL_UNPOOLED（Neon 直接连接）或 DATABASE_URL');
const pool=new pg.Pool({connectionString,connectionTimeoutMillis:15000});
try{await pool.query(schema);console.log('Database schema ready.');}finally{await pool.end();}
