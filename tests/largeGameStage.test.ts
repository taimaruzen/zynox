import {describe,it,expect,vi} from 'vitest';
vi.mock('../server/largeZipPrivateStaging',()=>({stageInspectedUpload:vi.fn(async()=>({ok:true,status:200,visibility:'private',publishable:false}))}));
import {handleLargeGameStage} from '../server/largeGameStage';
const id='123e4567-e89b-42d3-a456-426614174000';
const user={id:'owner',username:'owner',email:'owner@example.com'};
function env(owns:boolean,state='registered_private'){
return {DB:{prepare:()=>({bind:()=>({first:async()=>owns?{id,state}:null})})},GAME_UPLOADS:{}} as any;
}
const req=(origin:string)=>new Request('https://zynox.example/api/large-games/'+id+'/stage',{method:'POST',headers:{origin}});
describe('large game private staging authorization',()=>{
it('rejects unauthenticated requests',async()=>expect((await handleLargeGameStage(req('https://zynox.example'),env(true),null)).status).toBe(401));
it('rejects uploads not owned by caller',async()=>expect((await handleLargeGameStage(req('https://zynox.example'),env(false),user)).status).toBe(404));
it('rejects cross-origin mutations',async()=>expect((await handleLargeGameStage(req('https://attacker.example'),env(true),user)).status).toBe(403));
it('returns already staged status safely on retry',async()=>{
const res=await handleLargeGameStage(req('https://zynox.example'),env(true,'staged_private'),user);
expect(res.status).toBe(200);
const data=await res.json();
expect(data.alreadyStaged).toBe(true);
expect(data.publishable).toBe(false);
});
it('returns private non-publishable status',async()=>{
const res=await handleLargeGameStage(req('https://zynox.example'),env(true),user);
expect(res.status).toBe(200);
const data=await res.json();
expect(data.publishable).toBe(false);
});
});
