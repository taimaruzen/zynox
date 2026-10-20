import {assessAutomaticPublication,type PublicationAssessment} from './automaticPublicationPolicy';

export type PublicationRecord={
  gameId:string;
  assessment:PublicationAssessment;
  evaluatedAt:string;
  decision:'publish'|'quarantine';
  reasons:string[];
  schemaVersion:1;
};
/**
 * Pure audit record construction. Does not mutate game status, R2 manifests,
 * or accept client-provided safety flags.
 */
export function buildPublicationRecord(gameId:string,assessment:PublicationAssessment,at:Date=new Date()):PublicationRecord{
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId))throw Error('Invalid game id');
const decision=assessAutomaticPublication(assessment);
return {gameId,assessment:{...assessment},evaluatedAt:at.toISOString(),decision:decision.action,reasons:decision.reasons,schemaVersion:1};
}
