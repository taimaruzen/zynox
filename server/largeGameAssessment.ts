import {assessStagedUpload} from './assessStagedUpload';
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
/** Returns server-verified publication eligibility. Never publishes by itself. */
export async function handleLargeGameAssessment(req:Request,env:Env,user:User|null){
if(!user)return respond({error:'ログインが必要です'},401);
const url=new URL(req.url),match=url.pathname.match(/^\/api\/large-games\/([a-f0-9-]{36})\/assessment$/);
if(!match||req.method!=='GET')return respond({error:'Not found'},404);
const result=await assessStagedUpload(env,match[1],user.id);
return respond(result,result.status);
}
