import {unzipSync} from 'fflate';
import {validateGameZip} from './zipValidation';
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
const types:Record<string,string>={html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',txt:'text/plain; charset=utf-8'};
export async function prepareGame(env:Env,id:string){
const game=await env.DB.prepare("SELECT zip_key,status FROM games WHERE id=?").bind(id).first<{zip_key:string;status:string}>();
if(!game||game.status!=='pending')return {ok:false,error:'審査待ちのゲームが見つかりません',status:409};
const zip=await env.GAME_UPLOADS.get(game.zip_key);
if(!zip)return {ok:false,error:'元のZIPが見つかりません',status:404};
if(zip.size>10*1024*1024)return {ok:false,error:'ZIP容量の上限を超えています',status:400};
const buffer=await zip.arrayBuffer();
const validation=validateGameZip(buffer);
if(!validation.ok)return {ok:false,error:validation.error,status:400};
const files=unzipSync(new Uint8Array(buffer));
const names=Object.keys(files).filter(name=>!name.endsWith('/'));
const prefix='staged/'+id+'/';
const existing=await env.GAME_UPLOADS.get(prefix+'manifest.json');
if(existing)return {ok:true,files:names.length,alreadyPrepared:true};
const written:string[]=[];
try{
for(const name of names){
const ext=name.split('.').pop()?.toLowerCase()||'';
const key=prefix+'files/'+name;
await env.GAME_UPLOADS.put(key,files[name],{httpMetadata:{contentType:types[ext]||'application/octet-stream'},customMetadata:{visibility:'private-unreviewed'}});
written.push(key);
}
const manifest={gameId:id,files:names,preparedAt:new Date().toISOString(),visibility:'private',approved:false};
await env.GAME_UPLOADS.put(prefix+'manifest.json',JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});
return {ok:true,files:names.length,alreadyPrepared:false};
}catch(e){console.error('games.prepare_failed',e);await Promise.allSettled(written.map(key=>env.GAME_UPLOADS.delete(key)));return {ok:false,error:'展開ファイルの保存に失敗しました',status:500}}
}
