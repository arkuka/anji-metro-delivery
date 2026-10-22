import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,idleTimeoutMillis:5000,connectionTimeoutMillis:15000});
if(process.env.VERCEL) attachDatabasePool(pool);
export const schema=`
CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','driver')));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users ON DELETE CASCADE,expires TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts(username TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,blocked_until TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS deliveries(id SERIAL PRIMARY KEY,dealer TEXT NOT NULL,driver_id INTEGER REFERENCES users ON DELETE SET NULL,driver_name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),filename TEXT NOT NULL,pdf BYTEA NOT NULL);
CREATE TABLE IF NOT EXISTS parcels(id SERIAL PRIMARY KEY,sequence TEXT,dealer TEXT NOT NULL,pallet TEXT NOT NULL,order_no TEXT NOT NULL,area TEXT,address TEXT,load_no TEXT NOT NULL,scanned_at TIMESTAMPTZ,scanner_name TEXT,driver_id INTEGER REFERENCES users ON DELETE SET NULL,delivery_id INTEGER REFERENCES deliveries,UNIQUE(load_no,pallet));
CREATE INDEX IF NOT EXISTS parcels_pending ON parcels(dealer) WHERE delivery_id IS NULL;
`;
