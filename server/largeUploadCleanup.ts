// Administrative cleanup for expired private multipart sessions.
// Called explicitly by an authenticated Zynox admin; no cron is configured yet.
type Env={DB:D1Database;GAME_UPLOADS:R2Bucket};
type Row={id:string;object_key:string;upload_id:string;state:string};
export async function cleanupExpiredLargeUploads(env:Env){
const now=Math.floor(Date.now()/1000);
const rows=await env.DB.prepare("SELECT id,object_key,upload_id,state FROM large_upload_sessions WHERE (state='uploading' AND expires_at<?) OR (state IN ('aborted','failed','rejected') AND expires_at<?) ORDER BY expires_at ASC LIMIT 20").bind(now,now-3600).all<Row>();
let cleaned=0,failed=0;
for(const row of rows.results){
const claim=await env.DB.prepare("UPDATE large_upload_sessions SET state='cleaning' WHERE id=? AND state=?").bind(row.id,row.state).run();
if(claim.meta.changes!==1)continue;
try{
if(row.state==='uploading'||row.state==='aborted'||row.state==='failed'){
await env.GAME_UPLOADS.resumeMultipartUpload(row.object_key,row.upload_id).abort().catch(()=>{});
}
await env.GAME_UPLOADS.delete(row.object_key);
await env.DB.prepare("UPDATE large_upload_sessions SET state='cleaned' WHERE id=? AND state='cleaning'").bind(row.id).run();
cleaned++;
}catch(e){
console.error('large_upload.cleanup_failed',row.id,e);
await env.DB.prepare("UPDATE large_upload_sessions SET state=? WHERE id=? AND state='cleaning'").bind(row.state,row.id).run().catch(()=>{});
failed++;
}
}
return {ok:true,cleaned,failed,scanned:rows.results.length};
}
