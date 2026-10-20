type Env={DB:D1Database};
type User={id:string;username:string;email:string};
const choices=['profile','promotion','badges','items','other'] as const;
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleSurvey(req:Request,env:Env,user:User|null):Promise<Response>{
const path=new URL(req.url).pathname;
if(path==='/api/survey/results'&&req.method==='GET'){
const result=await env.DB.prepare('SELECT choice,COUNT(*) AS votes FROM zp_survey_responses GROUP BY choice').all<{choice:string;votes:number}>();
const counts=Object.fromEntries(choices.map(choice=>[choice,0])) as Record<string,number>;
for(const row of result.results)if(choices.some(c=>c===row.choice))counts[row.choice]=Number(row.votes)||0;
return reply({counts,total:Object.values(counts).reduce((a,b)=>a+b,0)});
}
if(!user)return reply({error:'回答するにはログインが必要です'},401);
if(path==='/api/survey/me'&&req.method==='GET'){
const answer=await env.DB.prepare('SELECT choice,comment,updated_at FROM zp_survey_responses WHERE user_id=?').bind(user.id).first();
return reply({answer:answer||null});
}
if(path!=='/api/survey/answer'||req.method!=='POST')return reply({error:'Not found'},404);
if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Invalid origin'},403);
if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'入力が長すぎます'},413);
let data:unknown;try{data=await req.json()}catch{return reply({error:'入力形式が正しくありません'},400)}
if(!data||typeof data!=='object')return reply({error:'入力形式が正しくありません'},400);
const input=data as Record<string,unknown>;
const choice=typeof input.choice==='string'?input.choice:'';
const comment=typeof input.comment==='string'?input.comment.trim():'';
if(!choices.some(c=>c===choice)||comment.length>500||(choice==='other'&&comment.length<3))return reply({error:'選択肢と自由記入欄を確認してください'},400);
await env.DB.prepare("INSERT INTO zp_survey_responses(user_id,choice,comment) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET choice=excluded.choice,comment=excluded.comment,updated_at=CURRENT_TIMESTAMP").bind(user.id,choice,comment).run();
return reply({ok:true});
}
