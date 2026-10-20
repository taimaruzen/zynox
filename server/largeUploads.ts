// Phase 1 of large ZIP uploads: private multipart staging only.
// No completion/publication endpoint is exposed until streaming ZIP validation is implemented.
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
type Session={id:string;user_id:string;object_key:string;upload_id:string;expected_size:number;expires_at:number;state:string};
const MAX=100*1024*1024,PART=5*1024*1024,TTL=60*60;
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleLargeUpload(req:Request,env:Env,user:User|null):Promise<Response>{
if(!user)return reply({error:'ログインが必要です'},401);
const url=new URL(req.url),path=url.pathname,now=Math.floor(Date.now()/1000);
if(req.method!=='POST'&&req.method!=='PUT'&&req.method!=='DELETE')return reply({error:'Method not allowed'},405);
if(req.headers.get('origin')!==url.origin)return reply({error:'Invalid origin'},403);
if(path==='/api/large-uploads/start'&&req.method==='POST'){
let body:unknown;try{body=await req.json()}catch{return reply({error:'Invalid JSON'},400)}
const size=typeof body==='object'&&body!==null&&'size' in body?(body as {size:unknown}).size:null;
if(typeof size!=='number'||!Number.isSafeInteger(size)||size<22||size>MAX)return reply({error:'ZIPは100MiB以下にしてください'},400);
const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM large_upload_sessions WHERE user_id=? AND state='uploading' AND expires_at>?").bind(user.id,now).first<{n:number}>();
if((active?.n||0)>=2)return reply({error:'同時アップロードは2件までです'},429);
const id=crypto.randomUUID(),key='unverified/'+user.id+'/'+id+'.zip';
const upload=await env.GAME_UPLOADS.createMultipartUpload(key,{httpMetadata:{contentType:'application/zip'}});
try{await env.DB.prepare('INSERT INTO large_upload_sessions(id,user_id,object_key,upload_id,expected_size,created_at,expires_at,state) VALUES(?,?,?,?,?,?,?,?)').bind(id,user.id,key,upload.uploadId,size,now,now+TTL,'uploading').run()}catch(e){await upload.abort().catch(()=>{});throw e}
return reply({sessionId:id,partSize:PART,maxSize:MAX,expiresAt:now+TTL});
}
const match=path.match(/^\/api\/large-uploads\/([a-f0-9-]{36})(?:\/parts\/(\d+)|\/abort)?$/);
if(!match)return reply({error:'Not found'},404);
const row=await env.DB.prepare('SELECT * FROM large_upload_sessions WHERE id=? AND user_id=?').bind(match[1],user.id).first<Session>();
if(!row)return reply({error:'Upload not found'},404);
const upload=env.GAME_UPLOADS.resumeMultipartUpload(row.object_key,row.upload_id);
if(path.endsWith('/abort')&&req.method==='DELETE'){
await upload.abort().catch(()=>{});
await env.DB.prepare("UPDATE large_upload_sessions SET state='aborted' WHERE id=? AND user_id=?").bind(row.id,user.id).run();
return reply({ok:true});
}
if(row.state!=='uploading'||row.expires_at<=now)return reply({error:'アップロード期限が切れています'},410);
if(match[2]&&req.method==='PUT'){
const number=Number(match[2]),parts=Math.ceil(row.expected_size/PART);
if(!Number.isInteger(number)||number<1||number>parts)return reply({error:'Invalid part number'},400);
const required=number===parts?row.expected_size-(parts-1)*PART:PART;
if(Number(req.headers.get('content-length'))!==required)return reply({error:'Invalid part size'},413);
if(!req.body)return reply({error:'Missing body'},400);
try{const part=await upload.uploadPart(number,req.body);return reply({partNumber:part.partNumber,etag:part.etag})}catch(e){console.error('large_upload.part_failed',e);return reply({error:'パートの保存に失敗しました'},500)}
}
return reply({error:'Not found'},404);
}
