import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const detail=readFileSync('src/GameDetailPage.tsx','utf8');
const policy=readFileSync('server/automaticPublicationPolicy.ts','utf8');
const assessment=readFileSync('server/assessStagedUpload.ts','utf8');
describe('automatic publication cannot bypass missing checks',()=>{
it('keeps runtime and abuse checks false until authoritative verification is implemented',()=>{
for(const key of ['isolatedOriginVerified','sandboxVerified','contentPolicyVerified','abuseControlsReady'])expect(assessment).toContain(key+':false');
});
it('requires all safety checks before publication',()=>{
for(const key of ['zipVerified','crcVerified','allAssetsStaged','isolatedOriginVerified','sandboxVerified','contentPolicyVerified','abuseControlsReady'])expect(policy).toContain("'"+key+"'");
});
it('does not grant iframe same-origin privileges',()=>{
expect(detail).toContain('sandbox="allow-scripts"');
expect(detail).not.toContain('sandbox="allow-scripts allow-same-origin"');
});
});
