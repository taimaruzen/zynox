import {publishVerifiedLargeGame} from './publishVerifiedLargeGame';
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
/** Owner-only publish attempt. Safety assessment runs server-side, never trusts client flags. */
export async function handleLargeGamePublish(req:Request,env:Env,user:User|null){
if(!user)return json({error:'ログインが必要です'},401);
const url=new URL(req.url),match=url.pathname.match(/^\/api\/large-games\/([a-f0-9-]{36})\/publish$/);
if(!match||req.method!=='POST')return json({error:'Not found'},404);
if(req.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
const result=await publishVerifiedLargeGame(env,match[1],user.id);
return json(result,result.status);
}
