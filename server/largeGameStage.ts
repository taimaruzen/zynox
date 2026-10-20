import {stageInspectedUpload} from './largeZipPrivateStaging';
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
/** Authenticated private staging endpoint. Never publishes a game. */
export async function handleLargeGameStage(req:Request,env:Env,user:User|null):Promise<Response>{
if(!user)return json({error:'ログインが必要です'},401);
const url=new URL(req.url);
const match=url.pathname.match(/^\/api\/large-games\/([0-9a-f-]{36})\/stage$/);
if(!match||req.method!=='POST')return json({error:'Not found'},404);
if(req.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
const session=await env.DB.prepare("SELECT id FROM large_upload_sessions WHERE id=? AND user_id=? AND state IN ('inspected','registered_private')").bind(match[1],user.id).first();
if(!session)return json({error:'対象のアップロードが見つかりません'},404);
const result=await stageInspectedUpload(env,match[1]);
return json(result,result.status);
}
