interface Env {DB:D1Database;GAME_UPLOADS:R2Bucket}
const parent='https://zynox.tainosuke79.workers.dev';
const mime:Record<string,string>={html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',txt:'text/plain; charset=utf-8'};
const notFound=()=>new Response('Not found',{status:404,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export default {async fetch(request:Request,env:Env):Promise<Response>{
if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
const url=new URL(request.url);
const match=url.pathname.match(/^\/g\/([a-f0-9-]{36})\/(.*)$/);
if(!match)return notFound();
const gameId=match[1],file=match[2]||'index.html';
if(!file||file.length>300||file.startsWith('/')||file.includes('\\')||file.split('/').some(p=>p==='.'||p==='..'||p==='')||file.includes('%'))return notFound();
const game=await env.DB.prepare("SELECT id FROM games WHERE id=? AND status='approved'").bind(gameId).first();
if(!game)return notFound();
const manifest=await env.GAME_UPLOADS.get('staged/'+gameId+'/manifest.json');
if(!manifest)return notFound();
let parsed:{files?:string[];approved?:boolean};
try{parsed=await manifest.json()}catch{return notFound()}
if(!Array.isArray(parsed.files)||!parsed.files.includes(file)||parsed.approved!==true)return notFound();
const object=await env.GAME_UPLOADS.get('staged/'+gameId+'/files/'+file);
if(!object)return notFound();
const ext=file.split('.').pop()?.toLowerCase()||'';
const headers=new Headers({'content-type':mime[ext]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'no-referrer','cross-origin-resource-policy':'cross-origin','cache-control':'no-store','permissions-policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','content-security-policy':"default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; frame-ancestors "+parent+"; sandbox allow-scripts"});
return new Response(request.method==='HEAD'?null:object.body,{status:200,headers});
}} satisfies ExportedHandler<Env>;
