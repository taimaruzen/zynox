import {describe,it,expect,vi} from 'vitest';
vi.mock('../server/assessStagedUpload',()=>({assessStagedUpload:vi.fn(async()=>({ok:true,status:200,record:{decision:'quarantine',reasons:['実行環境の検証が未完了']}}))}));
import {publishVerifiedLargeGame} from '../server/publishVerifiedLargeGame';
describe('large game publication guard',()=>{
it('does not mutate DB or R2 when security checks are incomplete',async()=>{
const prepare=vi.fn(()=>{throw Error('No DB access should occur')});
const put=vi.fn(()=>{throw Error('No R2 writes should occur')});
const result=await publishVerifiedLargeGame({DB:{prepare},GAME_UPLOADS:{put}} as any,'123e4567-e89b-42d3-a456-426614174000','owner');
expect(result.ok).toBe(false);
expect(result.status).toBe(409);
expect(prepare).not.toHaveBeenCalled();
expect(put).not.toHaveBeenCalled();
});
});
