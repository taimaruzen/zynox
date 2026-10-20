type Env={DB:D1Database};
type User={id:string;username:string;email:string};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function handlePlay(req:Request,env:Env,user:User|null):Promise<Response>{
const path=new URL(req.url).pathname;
if(path==='/api/play/stats'&&req.method==='GET'&&user){const result=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM play_sessions WHERE viewer_id=? AND counted=1) AS plays, (SELECT COALESCE(SUM(amount),0) FROM zp_ledger WHERE creator_id=?) AS zp').bind(user.id,user.id).first();return out(result||{plays:0,zp:0})}
if(!user)return out({error:'プレイ記録にはログインが必要です'},401);
if(req.method!=='POST'||req.headers.get('origin')!==new URL(req.url).origin)return out({error:'Invalid request'},403);
let body:unknown;try{body=await req.json()}catch{return out({error:'Invalid JSON'},400)}
const obj=typeof body==='object'&&body!==null?body as Record<string,unknown>:{};
const id=typeof obj.gameId==='string'?obj.gameId:'';
if(!/^[a-f0-9-]{36}$/.test(id))return out({error:'Invalid game'},400);
const game=await env.DB.prepare("SELECT id,owner_id FROM games WHERE id=? AND status='approved'").bind(id).first<{id:string;owner_id:string}>();
if(!game)return out({error:'ゲームが見つかりません'},404);
const now=Math.floor(Date.now()/1000);
if(path==='/api/play/start'){const session=crypto.randomUUID();await env.DB.prepare('INSERT INTO play_sessions(id,game_id,viewer_id,started_at) VALUES(?,?,?,?)').bind(session,id,user.id,now).run();return out({sessionId:session})}
if(path==='/api/play/finish'){
const session=typeof obj.sessionId==='string'?obj.sessionId:'';
if(!/^[a-f0-9-]{36}$/.test(session))return out({error:'Invalid session'},400);
const row=await env.DB.prepare('SELECT started_at,completed_at FROM play_sessions WHERE id=? AND game_id=? AND viewer_id=?').bind(session,id,user.id).first<{started_at:number;completed_at:number|null}>();
if(!row||row.completed_at!==null)return out({error:'セッションが無効です'},409);
if(now-row.started_at<30||now-row.started_at>3600)return out({error:'プレイ時間が条件を満たしていません'},409);
const updated=await env.DB.prepare('UPDATE play_sessions SET completed_at=? WHERE id=? AND completed_at IS NULL').bind(now,session).run();
if(updated.meta.changes!==1)return out({error:'既に処理されています'},409);
if(game.owner_id===user.id)return out({counted:false,reason:'self_play'});
const prior=await env.DB.prepare('SELECT 1 FROM play_sessions WHERE viewer_id=? AND game_id=? AND counted=1 AND completed_at>? LIMIT 1').bind(user.id,id,now-86400).first();
if(prior)return out({counted:false,reason:'cooldown'});
const count=await env.DB.prepare('UPDATE play_sessions SET counted=1 WHERE id=? AND counted=0').bind(session).run();
if(count.meta.changes!==1)return out({error:'処理済みです'},409);
await env.DB.prepare('INSERT OR IGNORE INTO zp_ledger(id,game_id,creator_id,play_session_id,amount,created_at) VALUES(?,?,?,?,1,?)').bind(crypto.randomUUID(),id,game.owner_id,session,now).run();
return out({counted:true,creatorZp:1});
}
return out({error:'Not found'},404)
}