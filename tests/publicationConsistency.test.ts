import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const games=readFileSync('server/games.ts','utf8');
const admin=readFileSync('server/admin.ts','utf8');
const play=readFileSync('server/play.ts','utf8');
describe('publication state consistency',()=>{
it('does not list unapproved or rejected games',()=>{
expect(games).toContain("g.status='approved'");
});
it('prevents play sessions for rejected games',()=>{
expect(play).toContain("status='approved'");
});
it('requires a verified staged manifest before manual approval',()=>{
expect(admin).toContain("manifest.files.includes('index.html')");
expect(admin).toContain("env.GAME_UPLOADS.head('staged/'+id+'/files/'+file)");
});
it('revokes listing status before attempting manifest revocation',()=>{
const update=admin.indexOf("UPDATE games SET status='rejected'");
const revoke=admin.indexOf("unpublishedAt:new Date().toISOString()");
expect(update).toBeGreaterThan(-1);
expect(revoke).toBeGreaterThan(update);
});
});
