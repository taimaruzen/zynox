import {buildPublicationRecord} from './publicationAudit';
import type {PublicationAssessment} from './automaticPublicationPolicy';

type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type Session={id:string;user_id:string;state:string};
type PrivateManifest={gameId?:unknown;uploadSessionId?:unknown;files?:unknown;verifiedCrc?:unknown;visibility?:unknown;approved?:unknown;publishable?:unknown};

/**
 * Construct publication eligibility exclusively from server-owned evidence.
 * Unimplemented runtime/content/abuse verifications MUST stay false.
 * This function does not publish or change game status.
 */
export async function assessStagedUpload(env:Env,sessionId:string,ownerId:string){
const row=await env.DB.prepare('SELECT id,user_id,state FROM large_upload_sessions WHERE id=? AND user_id=?')
.bind(sessionId,ownerId).first<Session>();
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
for(const file of manifest!.files as string[]){
if(!await env.GAME_UPLOADS.head(prefix+'files/'+file)){assetsPresent=false;break}
}
}
const evidence:PublicationAssessment={
zipVerified:row.state==='staged_private'&&manifest?.uploadSessionId===sessionId&&(!game||manifest?.gameId===game.id),
crcVerified:assetsPresent&&manifest?.verifiedCrc===true,
allAssetsStaged:assetsPresent&&manifest?.visibility==='private'&&manifest?.approved===false&&manifest?.publishable===false,
isolatedOriginVerified:false,
sandboxVerified:false,
contentPolicyVerified:false,
abuseControlsReady:false
};
const record=buildPublicationRecord(sessionId,evidence);
return {ok:true,status:200,record};
}
