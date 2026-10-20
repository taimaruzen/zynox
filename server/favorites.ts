type Env={DB:D1Database};
type User={id:string;username:string;email:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleFavorites(req:Request,env:Env,user:User|null):Promise<Response>{
if(!user)return json({error:'ログインが必要です'},401);
const path=new URL(req.url).pathname;
if(path==='/api/favorites'&&req.method==='GET'){
const result=await env.DB.prepare("SELECT g.id,g.title,g.description,g.category,g.created_at,g.orientation,u.username,CASE WHEN g.thumbnail_key IS NOT NULL THEN 1 ELSE 0 END AS has_thumbnail,(SELECT COUNT(*) FROM play_sessions p WHERE p.game_id=g.id) AS play_count FROM game_favorites f JOIN games g ON g.id=f.game_id JOIN users u ON u.id=g.owner_id WHERE f.user_id=? AND g.status='approved' ORDER BY f.created_at DESC LIMIT 100").bind(user.id).all();
return json({games:result.results});
}
const match=path.match(/^\/api\/favorites\/([a-f0-9-]{36})$/);
if(!match)return json({error:'Not found'},404);
const id=match[1];
if(req.method==='GET'){
const result=await env.DB.prepare('SELECT 1 FROM game_favorites WHERE user_id=? AND game_id=?').bind(user.id,id).first();
return json({favorite:!!result});
}
if(req.method!=='POST'&&req.method!=='DELETE')return json({error:'Method not allowed'},405);
if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid origin'},403);
if(req.method==='POST'){
const game=await env.DB.prepare("SELECT id FROM games WHERE id=? AND status='approved'").bind(id).first();
if(!game)return json({error:'公開ゲームが見つかりません'},404);
await env.DB.prepare('INSERT OR IGNORE INTO game_favorites(user_id,game_id) VALUES(?,?)').bind(user.id,id).run();
return json({favorite:true});
}
await env.DB.prepare('DELETE FROM game_favorites WHERE user_id=? AND game_id=?').bind(user.id,id).run();
return json({favorite:false});
}
