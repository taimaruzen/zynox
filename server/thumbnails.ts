type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type User={id:string;username:string;email:string};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const mime:Record<string,string>={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
function detect(b:Uint8Array):string|null{
if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'png';
if(b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255)return 'jpg';
if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return 'webp';
return null;
}
export async function handleThumbnail(req:Request,env:Env,user:User|null):Promise<Response>{
const path=new URL(req.url).pathname;
const match=path.match(/^\/api\/thumbnails\/([a-f0-9-]{36})$/);
if(!match)return json({error:'Not found'},404);
const id=match[1],game=await env.DB.prepare('SELECT id,owner_id,status,thumbnail_key FROM games WHERE id=?').bind(id).first<{id:string;owner_id:string;status:string;thumbnail_key:string|null}>();
if(!game)return json({error:'Not found'},404);
if(req.method==='GET'||req.method==='HEAD'){
if(game.status!=='approved'||!game.thumbnail_key)return json({error:'Not found'},404);
const object=await env.GAME_UPLOADS.get(game.thumbnail_key);
if(!object)return json({error:'Not found'},404);
const ext=game.thumbnail_key.split('.').pop()||'';
if(!mime[ext])return json({error:'Not found'},404);
return new Response(req.method==='HEAD'?null:object.body,{headers:{'content-type':mime[ext],'cache-control':'public,max-age=60','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'cross-origin-resource-policy':'same-origin'}});
}
if(req.method!=='POST')return json({error:'Method not allowed'},405);
if(!user||user.id!==game.owner_id)return json({error:'投稿者本人のみ変更できます'},403);
if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid origin'},403);
if(Number(req.headers.get('content-length')||0)>2*1024*1024+8192)return json({error:'画像は2MB以下にしてください'},413);
let form:FormData;try{form=await req.formData()}catch{return json({error:'画像を読み込めませんでした'},400)}
const file=form.get('image');
if(!(file instanceof File)||file.size===0||file.size>2*1024*1024)return json({error:'2MB以下の画像を選択してください'},400);
const buffer=await file.arrayBuffer(),ext=detect(new Uint8Array(buffer));
if(!ext||file.type!==mime[ext])return json({error:'PNG・JPEG・WebP形式の画像のみ使用できます'},400);
const key='thumbnails/'+id+'/'+crypto.randomUUID()+'.'+ext;
try{
await env.GAME_UPLOADS.put(key,buffer,{httpMetadata:{contentType:mime[ext]}});
await env.DB.prepare('UPDATE games SET thumbnail_key=? WHERE id=? AND owner_id=?').bind(key,id,user.id).run();
if(game.thumbnail_key)await env.GAME_UPLOADS.delete(game.thumbnail_key).catch(()=>{});
return json({ok:true,has_thumbnail:true});
}catch(e){console.error('thumbnail.upload_failed',e);await env.GAME_UPLOADS.delete(key).catch(()=>{});return json({error:'画像の保存に失敗しました'},500)}
}
