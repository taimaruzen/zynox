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
const reject=path.match(/^\/api\/admin\/games\/([a-f0-9-]{36})\/reject$/);
if(reject&&req.method==='POST'){if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);let data:unknown;try{data=await req.json()}catch{return reply({error:'Invalid JSON'},400)}const note=typeof data==='object'&&data!==null&&'note' in data&&typeof data.note==='string'?data.note.trim():'';if(note.length<5||note.length>500)return reply({error:'却下理由は5〜500文字で入力してください'},400);const game=await env.DB.prepare("SELECT id FROM games WHERE id=? AND status='pending'").bind(reject[1]).first();if(!game)return reply({error:'審査待ちのゲームが見つかりません'},409);await env.DB.batch([env.DB.prepare("UPDATE games SET status='rejected' WHERE id=? AND status='pending'").bind(reject[1]),env.DB.prepare("INSERT INTO moderation_events(id,game_id,admin_id,action,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),reject[1],user.id,'rejected',note)]);return reply({ok:true})}
return reply({error:'Not found'},404)
}