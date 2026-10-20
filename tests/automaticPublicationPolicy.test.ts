import {describe,it,expect} from 'vitest';
import {assessAutomaticPublication,type PublicationAssessment} from '../server/automaticPublicationPolicy';
const complete:PublicationAssessment={zipVerified:true,crcVerified:true,allAssetsStaged:true,isolatedOriginVerified:true,sandboxVerified:true,contentPolicyVerified:true,abuseControlsReady:true};
describe('automatic publication safety gate',()=>{
it('quarantines uploads with missing safety checks',()=>{
for(const key of Object.keys(complete) as (keyof PublicationAssessment)[]){
const decision=assessAutomaticPublication({...complete,[key]:false});
expect(decision.action).toBe('quarantine');
expect(decision.reasons.length).toBeGreaterThan(0);
}
});
it('permits publication only after every independent check passes',()=>{
expect(assessAutomaticPublication(complete)).toEqual({action:'publish',reasons:[]});
});
});
