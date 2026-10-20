import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const detail=readFileSync('src/GameDetailPage.tsx','utf8');
const admin=readFileSync('server/admin.ts','utf8');
const games=readFileSync('server/games.ts','utf8');
describe('game runtime isolation and publication guards',()=>{
it('uses an isolated runtime origin rather than the Zynox application origin',()=>{
expect(detail).toContain('https://zynox-game-runtime.tainosuke79.workers.dev');
expect(detail).toMatch(/sandbox="allow-scripts"/);
expect(detail).not.toMatch(/sandbox="[^"]*allow-same-origin/);
expect(detail).toContain('referrerPolicy="no-referrer"');
});
it('only lists approved games',()=>{
expect(games).toContain("g.status='approved'");
});
it('requires admin authorization for manual approval',()=>{
expect(admin).toContain('SELECT user_id FROM admin_users WHERE user_id=?');
expect(admin).toContain("data.reviewed!==true");
});
});
