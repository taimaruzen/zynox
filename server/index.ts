import {handleLargeGameStage} from './largeGameStage';
import {registerLargeGame} from './largeGameRegistration';
import {handleLargeUpload} from './largeUploads';
import {handleFavorites} from './favorites';
import {handleThumbnail} from './thumbnails';
import {handleSurvey} from './survey';
import {handlePlay} from './play';
import {handleAdmin} from './admin';
import {handleGames} from './games';
interface Env { DB: D1Database; ASSETS: Fetcher; GAME_UPLOADS: R2Bucket }
type User = {id:string;username:string;email:string};
const json=(data:unknown,status=200,headers:HeadersInit={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const bytes=(n:number)=>crypto.getRandomValues(new Uint8Array(n));
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const sha=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
const hash=async(password:string,salt:Uint8Array,iterations=100000)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations,hash:'SHA-256'},k,256)))};
const safeEqual=(a:string,b:string)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0};
const cookie=(value:string,maxAge:number)=>`zynox_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
async function current(req:Request,db:D1Database):Promise<User|null>{const token=req.headers.get('cookie')?.match(/(?:^|;\s*)zynox_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(!token)return null;return await db.prepare('SELECT u.id,u.username,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await sha(token),Math.floor(Date.now()/1000)).first<User>()}
async function issue(db:D1Database,userId:string){const token=hex(bytes(32));await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),userId,Math.floor(Date.now()/1000)+60*60*24*7).run();return cookie(token,604800)}
export default {async fetch(req:Request,env:Env):Promise<Response>{const url=new URL(req.url);if(/^\/api\/large-games\/[0-9a-f-]{36}\/stage$/.test(url.pathname))return handleLargeGameStage(req,env,await current(req,env.DB));if(url.pathname==='/api/large-games/register')return registerLargeGame(req,env,await current(req,env.DB));if(url.pathname.startsWith('/api/large-uploads/'))return handleLargeUpload(req,env,await current(req,env.DB));if(url.pathname.startsWith('/api/favorites'))return handleFavorites(req,env,await current(req,env.DB));if(url.pathname.startsWith('/api/thumbnails/'))return handleThumbnail(req,env,await current(req,env.DB));if(url.pathname.startsWith('/api/survey/'))return handleSurvey(req,env,await current(req,env.DB));if(url.pathname.startsWith('/api/play/'))return handlePlay(req,env,await current(req,env.DB));if(url.pathname.startsWith('/api/admin/'))return handleAdmin(req,env,await current(req,env.DB));if(url.pathname.startsWith('/api/games/'))return handleGames(req,env,await current(req,env.DB));if(!url.pathname.startsWith('/api/auth/'))return env.ASSETS.fetch(req);const path=url.pathname;const method=req.method;
if(method==='GET'&&path==='/api/auth/me')return json({user:await current(req,env.DB)});
if(method!=='POST')return json({error:'Not found'},404);
if(req.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
if(path==='/api/auth/logout'){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)zynox_session=([a-f0-9]{64})(?:;|$)/)?.[1];if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run();return json({ok:true},200,{'set-cookie':cookie('',0)})}
if(path!=='/api/auth/register'&&path!=='/api/auth/login')return json({error:'Not found'},404);
if(Number(req.headers.get('content-length')||0)>4096)return json({error:'Request too large'},413);
let data:any;try{data=await req.json()}catch{return json({error:'Invalid JSON'},400)}
const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';const password=typeof data.password==='string'?data.password:'';if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||new TextEncoder().encode(password).length>256)return json({error:'メールアドレスまたはパスワード（12文字以上）を確認してください'},400);
if(path==='/api/auth/register'){const username=typeof data.username==='string'?data.username.trim():'';if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))return json({error:'ユーザー名は英数字と_で3〜24文字にしてください'},400);const salt=bytes(16);const id=crypto.randomUUID();let passwordHash:string;try{passwordHash=await hash(password,salt)}catch(e){console.error('auth.password_hash_failed',e);return json({error:'パスワードの処理に失敗しました。時間をおいて再試行してください',code:'HASH_FAILED'},500)}try{await env.DB.prepare('INSERT INTO users(id,email,username,password_hash,salt,iterations) VALUES(?,?,?,?,?,?)').bind(id,email,username,passwordHash,hex(salt),100000).run()}catch(e){console.error('auth.user_insert_failed',e);const message=e instanceof Error?e.message:'';if(/UNIQUE constraint failed/i.test(message))return json({error:'メールアドレスまたはユーザー名が既に使用されています',code:'ALREADY_EXISTS'},409);return json({error:'登録処理でサーバーエラーが発生しました',code:'DB_INSERT_FAILED'},500)}return json({user:{id,email,username}},201,{'set-cookie':await issue(env.DB,id)})}
const row=await env.DB.prepare('SELECT id,email,username,password_hash,salt,iterations FROM users WHERE email=?').bind(email).first<{id:string;email:string;username:string;password_hash:string;salt:string;iterations:number}>();const salt=row?new Uint8Array(row.salt.match(/../g)!.map(v=>parseInt(v,16))):bytes(16);const actual=await hash(password,salt,row?.iterations||100000);if(!row||!safeEqual(actual,row.password_hash))return json({error:'メールアドレスまたはパスワードが違います'},401);return json({user:{id:row.id,email:row.email,username:row.username}},200,{'set-cookie':await issue(env.DB,row.id)})}
} satisfies ExportedHandler<Env>;