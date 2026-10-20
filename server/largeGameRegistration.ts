type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
type Session={id:string;object_key:string;expected_size:number;state:string};
const categories=['アクション','パズル','レース','シューティング','その他'];
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
/** Register a previously inspected large ZIP as pending; never make it public. */
export async function registerLargeGame(req:Request,env:Env,user:User|null){
if(!user)return json({error:'ログインが必要です'},401);
const url=new URL(req.url);
if(req.method!=='POST'||url.pathname!=='/api/large-games/register')return json({error:'Not found'},404);
if(req.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
if(Number(req.headers.get('content-length')||0)>8192)return json({error:'リクエストが大きすぎます'},413);
let input:unknown;try{input=await req.json()}catch{return json({error:'Invalid JSON'},400)}
if(!input||typeof input!=='object')return json({error:'Invalid input'},400);
const data=input as Record<string,unknown>;
const sessionId=typeof data.sessionId==='string'?data.sessionId:'';
const title=typeof data.title==='string'?data.title.trim():'';
const description=typeof data.description==='string'?data.description.trim():'';
const category=typeof data.category==='string'?data.category:'';
const orientation=typeof data.orientation==='string'?data.orientation:'auto';
if(!/^[0-9a-f-]{36}$/.test(sessionId)||!title||title.length>80||description.length>2000||!categories.includes(category)||!['auto','portrait','landscape'].includes(orientation))return json({error:'ゲーム情報を確認してください'},400);
const session=await env.DB.prepare('SELECT id,object_key,expected_size,state FROM large_upload_sessions WHERE id=? AND user_id=?').bind(sessionId,user.id).first<Session>();
if(session?.state==='registered_private'){const game=await env.DB.prepare('SELECT id,status FROM games WHERE owner_id=? AND zip_key=? LIMIT 1').bind(user.id,session.object_key).first<{id:string;status:string}>();if(game)return json({ok:true,id:game.id,status:game.status,alreadyRegistered:true})}
if(!session||session.state!=='inspected')return json({error:'非公開検査済みのアップロードが見つかりません'},409);
const object=await env.GAME_UPLOADS.head(session.object_key);
if(!object||object.size!==session.expected_size)return json({error:'ZIPファイルの保存状態を確認できません'},409);
const previous=await env.DB.prepare('SELECT id,status FROM games WHERE owner_id=? AND zip_key=? LIMIT 1').bind(user.id,session.object_key).first<{id:string;status:string}>();
if(previous)return json({ok:true,id:previous.id,status:previous.status,alreadyRegistered:true});
const id=crypto.randomUUID();
const claim=await env.DB.prepare("UPDATE large_upload_sessions SET state='registering' WHERE id=? AND user_id=? AND state='inspected'").bind(sessionId,user.id).run();
if(claim.meta.changes!==1)return json({error:'このZIPは既に登録処理中です'},409);
try{
await env.DB.prepare("INSERT INTO games(id,owner_id,title,description,category,zip_key,zip_size,status,orientation) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,user.id,title,description,category,session.object_key,session.expected_size,'pending',orientation).run();
await env.DB.prepare("UPDATE large_upload_sessions SET state='registered_private' WHERE id=? AND state='registering'").bind(sessionId).run();
return json({ok:true,id,status:'pending',publication:'not_available',message:'ゲーム情報を審査待ちとして登録しました。大容量ゲームの公開はまだできません'},201);
}catch(e){
console.error('large_games.registration_failed',e);
await env.DB.prepare("UPDATE large_upload_sessions SET state='inspected' WHERE id=? AND state='registering'").bind(sessionId).run().catch(()=>{});
return json({error:'ゲーム情報の登録に失敗しました'},500);
}
}
