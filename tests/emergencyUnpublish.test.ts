import {describe,it,expect} from 'vitest';
import {handleAdmin} from '../server/admin';

const gameId='123e4567-e89b-42d3-a456-426614174000';
const user={id:'admin-user',username:'admin',email:'admin@example.com'};
function fixture(authorized:boolean){
let status='approved',revoked=false;
const db={prepare(sql:string){let values:unknown[]=[];return {
bind(...args:unknown[]){values=args;return this},
async first(){
if(sql.includes('FROM admin_users'))return authorized?{user_id:user.id}:null;
if(sql.includes('FROM games'))return status==='approved'?{id:gameId}:null;
return null;
},
async run(){
if(sql.includes("UPDATE games SET status='rejected'")){if(status!=='approved')return {meta:{changes:0}};status='rejected';return {meta:{changes:1}}}
return {meta:{changes:1},values};
}
}}},
r2={async get(){return {json:async()=>({gameId,approved:true,visibility:'public',files:['index.html']})}},async put(_key:string,data:string){const manifest=JSON.parse(data);revoked=manifest.approved===false&&manifest.visibility==='private'}};
return {env:{DB:db,GAME_UPLOADS:r2} as any,getStatus:()=>status,revoked:()=>revoked};
}
const request=(origin:string,body:unknown)=>new Request('https://zynox.example/api/admin/games/'+gameId+'/unpublish',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
describe('emergency unpublish',()=>{
it('rejects users without admin privileges',async()=>{
const x=fixture(false);const response=await handleAdmin(request('https://zynox.example',{reason:'malware detected'}),x.env,user);
expect(response.status).toBe(403);expect(x.getStatus()).toBe('approved');
});
it('rejects cross-origin requests',async()=>{
const x=fixture(true);const response=await handleAdmin(request('https://attacker.example',{reason:'malware detected'}),x.env,user);
expect(response.status).toBe(403);expect(x.getStatus()).toBe('approved');
});
it('removes approved listing status and revokes manifest',async()=>{
const x=fixture(true);const response=await handleAdmin(request('https://zynox.example',{reason:'malware detected'}),x.env,user);
expect(response.status).toBe(200);expect(x.getStatus()).toBe('rejected');expect(x.revoked()).toBe(true);
});
});
