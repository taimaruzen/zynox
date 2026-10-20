import {assessStagedUpload} from './assessStagedUpload';
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type Game={id:string;owner_id:string;status:string};
type Manifest={gameId?:string;files?:string[];approved?:boolean;visibility?:string;verifiedCrc?:boolean;publishable?:boolean};
/**
 * Fail-closed publication commit. No client-supplied safety flags are trusted.
 * Until the runtime/content/abuse gates are verified by the server,
 * assessStagedUpload returns quarantine and this function does not publish.
 */
export async function publishVerifiedLargeGame(env:Env,sessionId:string,ownerId:string){
const assessment=await assessStagedUpload(env,sessionId,ownerId);
if(!assessment.ok)return {ok:false,status:assessment.status,error:assessment.error};
if(assessment.record.decision!=='publish')return {ok:false,status:409,error:'自動公開の安全条件が未完了です',reasons:assessment.record.reasons};
const session=await env.DB.prepare('SELECT object_key FROM large_upload_sessions WHERE id=? AND user_id=? AND state=?').bind(sessionId,ownerId,'staged_private').first<{object_key:string}>();
if(!session)return {ok:false,status:409,error:'検証済みZIPが見つかりません'};
const game=await env.DB.prepare('SELECT id,owner_id,status FROM games WHERE zip_key=? AND owner_id=?').bind(session.object_key,ownerId).first<Game>();
if(!game||game.status!=='pending')return {ok:false,status:409,error:'公開待ちゲームが見つかりません'};
const key='staged/'+game.id+'/manifest.json';
const object=await env.GAME_UPLOADS.get(key);
if(!object)return {ok:false,status:409,error:'公開ファイルが見つかりません'};
let manifest:Manifest;
try{manifest=await object.json() as Manifest}catch{return {ok:false,status:409,error:'マニフェストが不正です'}}
if(manifest.gameId!==game.id||manifest.approved!==false||manifest.visibility!=='private'||manifest.verifiedCrc!==true||!Array.isArray(manifest.files)||!manifest.files.includes('index.html'))return {ok:false,status:409,error:'公開ファイルの検証状態が不正です'};
const claimed=await env.DB.prepare("UPDATE large_upload_sessions SET state='publishing' WHERE id=? AND user_id=? AND state='staged_private'").bind(sessionId,ownerId).run();
if(claimed.meta.changes!==1)return {ok:false,status:409,error:'別の公開処理が進行中です'};
try{
const next={...manifest,approved:true,visibility:'public',publishable:true,approvedAt:new Date().toISOString(),approvedBy:'automatic-validation'};
await env.GAME_UPLOADS.put(key,JSON.stringify(next),{httpMetadata:{contentType:'application/json'}});
const update=await env.DB.prepare("UPDATE games SET status='approved' WHERE id=? AND status='pending'").bind(game.id).run();
if(update.meta.changes!==1)throw Error('Game status changed during publication');
await env.DB.prepare("UPDATE large_upload_sessions SET state='published' WHERE id=? AND state='publishing'").bind(sessionId).run();
return {ok:true,status:200,gameId:game.id,published:true};
}catch(error){
console.error('large_game.publish_failed',error);
await env.DB.prepare("UPDATE games SET status='pending' WHERE id=? AND status='approved'").bind(game.id).run().catch(()=>{});
await env.GAME_UPLOADS.put(key,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}}).catch(()=>{});
await env.DB.prepare("UPDATE large_upload_sessions SET state='staged_private' WHERE id=? AND state='publishing'").bind(sessionId).run().catch(()=>{});
return {ok:false,status:500,error:'公開処理に失敗しました。状態を確認してください'};
}
}
