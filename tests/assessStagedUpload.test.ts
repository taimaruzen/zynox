import {describe,it,expect} from 'vitest';
import {assessStagedUpload} from '../server/assessStagedUpload';
const id='123e4567-e89b-42d3-a456-426614174000';
function env(state:string,missing=false){
const manifest={uploadSessionId:id,files:['index.html','main.js'],verifiedCrc:true,visibility:'private',approved:false,publishable:false};
return {
DB:{prepare:()=>({bind:()=>({first:async()=>({id,user_id:'owner',state})})})},
GAME_UPLOADS:{
get:async()=>({json:async()=>manifest}),
head:async(key:string)=>missing&&key.endsWith('main.js')?null:{size:12}
}
} as any;
}
describe('server-evidence publication assessment',()=>{
it('quarantines staged games until runtime and abuse checks exist',async()=>{
const result=await assessStagedUpload(env('staged_private'),id,'owner');
expect(result.ok).toBe(true);
if(!result.ok)return;
expect(result.record.assessment.crcVerified).toBe(true);
expect(result.record.decision).toBe('quarantine');
expect(result.record.reasons.length).toBeGreaterThan(0);
});
it('rejects missing staged assets',async()=>{
const result=await assessStagedUpload(env('staged_private',true),id,'owner');
if(!result.ok)throw Error('fixture failed');
expect(result.record.assessment.allAssetsStaged).toBe(false);
expect(result.record.decision).toBe('quarantine');
});
it('does not treat an un-staged session as verified',async()=>{
const result=await assessStagedUpload(env('inspected'),id,'owner');
if(!result.ok)throw Error('fixture failed');
expect(result.record.assessment.zipVerified).toBe(false);
expect(result.record.decision).toBe('quarantine');
});
});
