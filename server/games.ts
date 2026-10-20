import {validateGameZip} from './zipValidation';
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const categories=['アクション','パズル','レース','シューティング','その他'];
export async function handleGames(req:Request,env:Env,user:User|null):Promise<Response>{
const path=new URL(req.url).pathname;
if(path==='/api/games/public'&&req.method==='GET'){const result=await env.DB.prepare("SELECT g.id,g.title,g.description,g.category,g.created_at,g.orientation,u.username,CASE WHEN g.thumbnail_key IS NOT NULL THEN 1 ELSE 0 END AS has_thumbnail,(SELECT COUNT(*) FROM play_sessions p WHERE p.game_id=g.id) AS play_count FROM games g JOIN users u ON g.owner_id=u.id WHERE g.status='approved' ORDER BY g.created_at DESC LIMIT 100").all();return respond({games:result.results})}
if(!user)return respond({error:'ログインが必要です'},401);
if(path==='/api/games/mine'&&req.method==='GET'){const result=await env.DB.prepare('SELECT g.id,g.title,g.description,g.category,g.status,g.created_at,g.orientation,CASE WHEN g.thumbnail_key IS NOT NULL THEN 1 ELSE 0 END AS has_thumbnail,(SELECT COUNT(*) FROM play_sessions p WHERE p.game_id=g.id) AS play_count FROM games g WHERE g.owner_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();return respond({games:result.results})}
if(path!=='/api/games/upload'||req.method!=='POST')return respond({error:'Not found'},404);
if(req.headers.get('origin')!==new URL(req.url).origin)return respond({error:'Invalid origin'},403);
const max=10*1024*1024;
if(Number(req.headers.get('content-length')||0)>max+16384)return respond({error:'ZIPファイルは10MB以下にしてください'},413);
let form:FormData;try{form=await req.formData()}catch{return respond({error:'フォームを読み取れません'},400)}
const title=String(form.get('title')||'').trim(),description=String(form.get('description')||'').trim(),category=String(form.get('category')||''),orientation=String(form.get('orientation')||'auto');
const file=form.get('file');
if(title.length<1||title.length>80||description.length>2000||!categories.includes(category)||!['auto','portrait','landscape'].includes(orientation))return respond({error:'ゲーム情報を確認してください'},400);
if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.zip')||file.size<4||file.size>max)return respond({error:'10MB以下のZIPファイルを選択してください'},400);
const data=await file.arrayBuffer();const head=new Uint8Array(data,0,4);
if(head[0]!==0x50||head[1]!==0x4b||head[2]!==0x03||head[3]!==0x04)return respond({error:'ZIPファイルの形式が正しくありません'},400);
const validation=validateGameZip(data);if(!validation.ok)return respond({error:validation.error},400);
const id=crypto.randomUUID(),key='pending/'+user.id+'/'+id+'.zip';
try{await env.GAME_UPLOADS.put(key,data,{httpMetadata:{contentType:'application/zip'}});await env.DB.prepare('INSERT INTO games(id,owner_id,title,description,category,zip_key,zip_size,status,orientation) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,user.id,title,description,category,key,file.size,'pending',orientation).run();return respond({ok:true,id,status:'pending'},201)}
catch(e){console.error('games.upload_failed',e);await env.GAME_UPLOADS.delete(key).catch(()=>{});return respond({error:'アップロードに失敗しました'},500)}
}