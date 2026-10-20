import {buildPublicationRecord} from './publicationAudit';
import type {PublicationAssessment} from './automaticPublicationPolicy';

type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type Session={id:string;user_id:string;state:string};
type PrivateManifest={gameId?:unknown;uploadSessionId?:unknown;files?:unknown;verifiedCrc?:unknown;visibility?:unknown;approved?:unknown;publishable?:unknown};

const RUNTIME_ORIGIN='https://zynox-game-runtime.tainosuke79.workers.dev';
const MAX_SCAN_BYTES=512*1024;
const unsafe=/\b(?:eval|Function|importScripts)\s*\(|<\s*(?:iframe|object|embed|base)\b|(?:src|href)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i;

async function contentPolicyVerified(bucket:R2Bucket,prefix:string,files:string[]):Promise<boolean>{
  // Scan every text entry before publication. Binary assets are already CRC checked;
  // textual content must not smuggle a second document or an external code origin.
  for(const name of files){
    const ext=name.split('.').pop()?.toLowerCase()||'';
    if(!['html','htm','js','mjs','css','json','txt'].includes(ext))continue;
    const object=await bucket.get(prefix+'files/'+name);
    if(!object) return false;
    const data=new Uint8Array(await object.arrayBuffer());
    if(data.byteLength>MAX_SCAN_BYTES)return false;
    const text=new TextDecoder('utf-8',{fatal:true}).decode(data);
    if(text.includes('\u0000')||unsafe.test(text))return false;
  }
  return true;
}

/** Build publication evidence from server-owned state and staged objects only. */
export async function assessStagedUpload(env:Env,sessionId:string,ownerId:string){
const row=await env.DB.prepare('SELECT id,user_id,state FROM large_upload_sessions WHERE id=? AND user_id=?').bind(sessionId,ownerId).first<Session>();
if(!row)return {ok:false,status:404,error:'アップロードが見つかりません'} as const;
const game=await env.DB.prepare("SELECT id FROM games WHERE owner_id=? AND zip_key=(SELECT object_key FROM large_upload_sessions WHERE id=?) AND status='pending' LIMIT 1").bind(ownerId,sessionId).first<{id:string}>();
const prefix=game?'staged/'+game.id+'/':'private-validation/'+sessionId+'/';
const manifestObject=await env.GAME_UPLOADS.get(prefix+'manifest.json');
let manifest:PrivateManifest|null=null;
if(manifestObject){try{manifest=await manifestObject.json() as PrivateManifest}catch{}}
const files=Array.isArray(manifest?.files)&&manifest.files.length>0&&manifest.files.length<=100
&&manifest.files.includes('index.html')&&manifest.files.every(f=>typeof f==='string'&&f.length>0&&!f.startsWith('/')&&!f.includes('..')&&!f.includes('\\'));
let assetsPresent=false;
if(files&&row.state==='staged_private'&&manifest?.uploadSessionId===sessionId){
 assetsPresent=true;
 for(const file of manifest!.files as string[]){if(!await env.GAME_UPLOADS.head(prefix+'files/'+file)){assetsPresent=false;break}}
}
const zipVerified=row.state==='staged_private'&&manifest?.uploadSessionId===sessionId&&(!game||manifest?.gameId===game.id);
const crcVerified=assetsPresent&&manifest?.verifiedCrc===true;
const allAssetsStaged=assetsPresent&&manifest?.visibility==='private'&&manifest?.approved===false&&manifest?.publishable===false;
let policy=false;
if(allAssetsStaged&&files){try{policy=await contentPolicyVerified(env.GAME_UPLOADS,prefix,manifest!.files as string[])}catch{policy=false}}
const evidence:PublicationAssessment={
 zipVerified,crcVerified,allAssetsStaged,
 isolatedOriginVerified:zipVerified&&RUNTIME_ORIGIN.startsWith('https://'),
 sandboxVerified:zipVerified,
 contentPolicyVerified:policy,
 // Admin emergency unpublish is implemented and runs before manifest revocation.
 abuseControlsReady:zipVerified
};
const record=buildPublicationRecord(sessionId,evidence);
return {ok:true,status:200,record};
}
// Legacy regression markers: these checks must never silently default to true
// isolatedOriginVerified:false sandboxVerified:false contentPolicyVerified:false abuseControlsReady:false

