type Env={DB:D1Database};
type User={id:string;username:string;email:string};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const reasons=new Set(['malware','phishing','abuse','copyright','other']);
export async function handleGameReports(req:Request,env:Env,user:User|null):Promise<Response>{
if(!user)return respond({error:'ログインが必要です'},401);
const url=new URL(req.url),match=url.pathname.match(/^\/api\/game-reports\/([a-f0-9-]{36})$/);
if(!match||req.method!=='POST')return respond({error:'Not found'},404);
if(req.headers.get('origin')!==url.origin)return respond({error:'Invalid origin'},403);
if(Number(req.headers.get('content-length')||0)>4096)return respond({error:'リクエストが大きすぎます'},413);
let input:unknown;try{input=await req.json()}catch{return respond({error:'Invalid JSON'},400)}
const obj=input&&typeof input==='object'?input as Record<string,unknown>:{};
const reason=typeof obj.reason==='string'?obj.reason:'',note=typeof obj.note==='string'?obj.note.trim():'';
if(!reasons.has(reason)||note.length>500)return respond({error:'通報内容を確認してください'},400);
const game=await env.DB.prepare("SELECT id,owner_id FROM games WHERE id=? AND status='approved'").bind(match[1]).first<{id:string;owner_id:string}>();
if(!game)return respond({error:'公開中のゲームが見つかりません'},404);
if(game.owner_id===user.id)return respond({error:'自分のゲームは通報できません'},400);
const now=Math.floor(Date.now()/1000);
const existing=await env.DB.prepare('SELECT id FROM game_reports WHERE game_id=? AND reporter_id=?').bind(game.id,user.id).first();
if(existing)return respond({ok:true,alreadyReported:true});
await env.DB.prepare('INSERT INTO game_reports(id,game_id,reporter_id,reason,note,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),game.id,user.id,reason,note,now).run();
return respond({ok:true});
}
