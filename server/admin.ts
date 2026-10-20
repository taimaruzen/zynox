import {prepareGame} from './prepareGame';
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleAdmin(req:Request,env:Env,user:User|null):Promise<Response>{
if(!user)return reply({error:'ログインが必要です'},401);
const admin=await env.DB.prepare('SELECT user_id FROM admin_users WHERE user_id=?').bind(user.id).first();
if(!admin)return reply({error:'管理者権限がありません'},403);
const path=new URL(req.url).pathname;
if(path==='/api/admin/me'&&req.method==='GET')return reply({admin:true});
if(path==='/api/admin/games'&&req.method==='GET'){const result=await env.DB.prepare("SELECT g.id,g.title,g.description,g.category,g.status,g.created_at,g.zip_size,u.username FROM games g JOIN users u ON g.owner_id=u.id WHERE g.status='pending' ORDER BY g.created_at ASC LIMIT 100").all();return reply({games:result.results})}
const download=path.match(/^\/api\/admin\/games\/([a-f0-9-]{36})\/download$/);
if(download&&req.method==='GET'){const game=await env.DB.prepare('SELECT zip_key,title FROM games WHERE id=?').bind(download[1]).first<{zip_key:string;title:string}>();if(!game)return reply({error:'ゲームが見つかりません'},404);const object=await env.GAME_UPLOADS.get(game.zip_key);if(!object)return reply({error:'ZIPが見つかりません'},404);return new Response(object.body,{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="game-review.zip"','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}})}
const prepare=path.match(/^\/api\/admin\/games\/([a-f0-9-]{36})\/prepare$/);
if(prepare&&req.method==='POST'){if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);const result=await prepareGame(env,prepare[1]);return reply(result,result.ok?200:result.status)}
const approve=path.match(/^\/api\/admin\/games\/([a-f0-9-]{36})\/approve$/);
if(approve&&req.method==='POST'){
if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);
let data:unknown;try{data=await req.json()}catch{return reply({error:'Invalid JSON'},400)}
if(typeof data!=='object'||data===null||!('reviewed' in data)||data.reviewed!==true)return reply({error:'手動レビューの確認が必要です'},400);
const id=approve[1],game=await env.DB.prepare("SELECT id FROM games WHERE id=? AND status='pending'").bind(id).first();
if(!game)return reply({error:'審査待ちのゲームが見つかりません'},409);
const key='staged/'+id+'/manifest.json',object=await env.GAME_UPLOADS.get(key);
if(!object)return reply({error:'先にZIPを検証・展開してください'},409);
let manifest:{gameId?:string;files?:string[];approved?:boolean;visibility?:string};
try{manifest=await object.json()}catch{return reply({error:'マニフェストが不正です'},409)}
if(manifest.gameId!==id||!Array.isArray(manifest.files)||!manifest.files.includes('index.html')||manifest.files.length===0||manifest.files.length>100)return reply({error:'マニフェストの検証に失敗しました'},409);
for(const file of manifest.files){if(typeof file!=='string'||file.includes('..')||file.startsWith('/')||file.includes('\\'))return reply({error:'ファイルパスが不正です'},409);if(!await env.GAME_UPLOADS.head('staged/'+id+'/files/'+file))return reply({error:'展開ファイルが不足しています'},409)}
const approved={...manifest,approved:true,visibility:'public',approvedAt:new Date().toISOString(),approvedBy:user.id};
try{
await env.GAME_UPLOADS.put(key,JSON.stringify(approved),{httpMetadata:{contentType:'application/json'}});
const update=await env.DB.prepare("UPDATE games SET status='approved' WHERE id=? AND status='pending'").bind(id).run();
if(update.meta.changes!==1){await env.GAME_UPLOADS.put(key,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'}});return reply({error:'審査状態が変更されています'},409)}
await env.DB.prepare("INSERT INTO moderation_events(id,game_id,admin_id,action,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,user.id,'approved','手動レビュー済み').run();
return reply({ok:true});
}catch(e){console.error('games.approval_failed',e);return reply({error:'承認処理に失敗しました。管理者に確認してください'},500)}
}
const unpublish=path.match(/^\/api\/admin\/games\/([a-f0-9-]{36})\/unpublish$/);
if(unpublish&&req.method==='POST'){
if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);
if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'リクエストが大きすぎます'},413);
let input:unknown;try{input=await req.json()}catch{return reply({error:'Invalid JSON'},400)}
const note=typeof input==='object'&&input!==null&&'reason' in input&&typeof input.reason==='string'?input.reason.trim():'';
if(note.length<5||note.length>500)return reply({error:'公開停止理由は5〜500文字で入力してください'},400);
const id=unpublish[1],game=await env.DB.prepare("SELECT id FROM games WHERE id=? AND status='approved'").bind(id).first();
if(!game)return reply({error:'公開中のゲームが見つかりません'},409);
const changed=await env.DB.prepare("UPDATE games SET status='rejected' WHERE id=? AND status='approved'").bind(id).run();
if(changed.meta.changes!==1)return reply({error:'ゲームの公開状態が変更されています'},409);
try{
const key='staged/'+id+'/manifest.json',object=await env.GAME_UPLOADS.get(key);
if(object){
const manifest=await object.json() as Record<string,unknown>;
await env.GAME_UPLOADS.put(key,JSON.stringify({...manifest,approved:false,visibility:'private',unpublishedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json'}});
}
await env.DB.prepare("INSERT INTO moderation_events(id,game_id,admin_id,action,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,user.id,'rejected','緊急公開停止: '+note).run();
return reply({ok:true,status:'rejected'});
}catch(e){console.error('games.unpublish_failed',e);return reply({error:'一覧から非公開にしましたが、実行環境の停止確認が必要です'},500)}
}
const reject=path.match(/^\/api\/admin\/games\/([a-f0-9-]{36})\/reject$/);
if(reject&&req.method==='POST'){if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);let data:unknown;try{data=await req.json()}catch{return reply({error:'Invalid JSON'},400)}const note=typeof data==='object'&&data!==null&&'note' in data&&typeof data.note==='string'?data.note.trim():'';if(note.length<5||note.length>500)return reply({error:'却下理由は5〜500文字で入力してください'},400);const game=await env.DB.prepare("SELECT id FROM games WHERE id=? AND status='pending'").bind(reject[1]).first();if(!game)return reply({error:'審査待ちのゲームが見つかりません'},409);await env.DB.batch([env.DB.prepare("UPDATE games SET status='rejected' WHERE id=? AND status='pending'").bind(reject[1]),env.DB.prepare("INSERT INTO moderation_events(id,game_id,admin_id,action,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),reject[1],user.id,'rejected',note)]);return reply({ok:true})}
return reply({error:'Not found'},404)
}