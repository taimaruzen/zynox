import {describe,it,expect} from 'vitest';
import {buildPublicationRecord} from '../server/publicationAudit';
import type {PublicationAssessment} from '../server/automaticPublicationPolicy';
const id='123e4567-e89b-42d3-a456-426614174000';
const checks:PublicationAssessment={zipVerified:true,crcVerified:true,allAssetsStaged:true,isolatedOriginVerified:true,sandboxVerified:true,contentPolicyVerified:true,abuseControlsReady:true};
describe('publication audit records',()=>{
it('records quarantine with missing checks',()=>{
const record=buildPublicationRecord(id,{...checks,contentPolicyVerified:false},new Date('2026-10-21T00:00:00Z'));
expect(record.decision).toBe('quarantine');
expect(record.reasons.length).toBe(1);
expect(record.schemaVersion).toBe(1);
});
it('records publish eligibility when all checks pass',()=>{
expect(buildPublicationRecord(id,checks).decision).toBe('publish');
});
it('rejects invalid game identifiers',()=>{
expect(()=>buildPublicationRecord('../bad',checks)).toThrow();
});
});
