import {stageStoredZipEntry} from './largeZipStoredStaging';
import {inspectLargeZip} from './largeZipInspection';
import {verifyLargeZipEntry} from './largeZipEntryVerification';

type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type Session={id:string;user_id:string;object_key:string;state:string};
const mime:Record<string,string>={html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',txt:'text/plain; charset=utf-8'};
const MAX_FILES=100,MAX_ENTRY=16*1024*1024,MAX_TOTAL=128*1024*1024;

/** Private staging prototype. Never creates an approved game or public manifest. */
export async function stageInspectedUpload(env:Env,sessionId:string){
const row=await env.DB.prepare("SELECT id,user_id,object_key,state FROM large_upload_sessions WHERE id=?").bind(sessionId).first<Session>();
if(!row||!['inspected','registered_private'].includes(row.state))return {ok:false,status:409,error:'検査済みアップロードがありません'};
const claim=await env.DB.prepare("UPDATE large_upload_sessions SET state='staging' WHERE id=? AND state IN ('inspected','registered_private')").bind(sessionId).run();
if(claim.meta.changes!==1)return {ok:false,status:409,error:'別の処理が進行中です'};
const registered=await env.DB.prepare('SELECT id FROM games WHERE owner_id=? AND zip_key=? AND status=? LIMIT 1').bind(row.user_id,row.object_key,'pending').first<{id:string}>();
const prefix=registered?'staged/'+registered.id+'/':'private-validation/'+row.id+'/';
const priorState=row.state;
const written:string[]=[];
try{
const inspection=await inspectLargeZip(env.GAME_UPLOADS,row.object_key);
if(!inspection.ok)throw Error(inspection.error);
if(inspection.entries.length>MAX_FILES||inspection.expandedBytes>MAX_TOTAL||inspection.entries.some(e=>e.uncompressed>(e.method===0?64*1024*1024:MAX_ENTRY)))throw Error('現段階の検証上限（100ファイル・各16MiB）を超えています');
for(const entry of inspection.entries){
const ext=entry.name.split('.').pop()?.toLowerCase()||'';
const key=prefix+'files/'+entry.name;
written.push(key);
if(entry.method===0){await stageStoredZipEntry(env.GAME_UPLOADS,row.object_key,key,entry,mime[ext]||'application/octet-stream')}else{const checked=await verifyLargeZipEntry(env.GAME_UPLOADS,row.object_key,entry.name,entry);if(!checked.ok)throw Error(checked.error);await env.GAME_UPLOADS.put(key,checked.data,{httpMetadata:{contentType:mime[ext]||'application/octet-stream'},customMetadata:{visibility:'private-unverified'}})}
}
const manifest={gameId:registered?.id,uploadSessionId:row.id,files:inspection.entries.map(e=>e.name),visibility:'private',verifiedCrc:true,approved:false,publishable:false,stagedAt:new Date().toISOString()};
written.push(prefix+'manifest.json');
await env.GAME_UPLOADS.put(prefix+'manifest.json',JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'},customMetadata:{visibility:'private-unverified'}});
await env.DB.prepare("UPDATE large_upload_sessions SET state='staged_private' WHERE id=? AND state='staging'").bind(row.id).run();
return {ok:true,status:200,files:manifest.files.length,visibility:'private',publishable:false};
}catch(e){
console.error('large_zip.private_staging_failed',e);
await Promise.allSettled(written.map(key=>env.GAME_UPLOADS.delete(key)));
await env.DB.prepare("UPDATE large_upload_sessions SET state=? WHERE id=? AND state='staging'").bind(priorState,row.id).run().catch(()=>{});
return {ok:false,status:422,error:e instanceof Error?e.message:'ZIP検証に失敗しました'};
}
}
