import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {stageInspectedUpload} from '../server/largeZipPrivateStaging';

function environment(zip:Uint8Array){
const objects=new Map<string,Uint8Array>([['unverified/u/session.zip',zip]]);
let state='inspected';
const db={
prepare(sql:string){
let args:unknown[]=[];
return {
bind(...values:unknown[]){args=values;return this},
async first(){return {id:'session',user_id:'u',object_key:'unverified/u/session.zip',state}},
async run(){
if(sql.includes("SET state='staging'")){if(state!=='inspected')return {meta:{changes:0}};state='staging'}
if(sql.includes("SET state='staged_private'"))state='staged_private';
if(sql.includes("SET state='inspected'"))state='inspected';
return {meta:{changes:1},args};
}
};
}
};
const r2={
async head(key:string){const data=objects.get(key);return data?{size:data.length}:null},
async get(key:string,opts?:{range:{offset:number;length:number}}){
const data=objects.get(key);if(!data)return null;
const bytes=opts?data.slice(opts.range.offset,opts.range.offset+opts.range.length):data;
return {arrayBuffer:async()=>bytes.buffer,body:new ReadableStream({start(c){c.enqueue(bytes);c.close()}})};
},
async put(key:string,bytes:Uint8Array|string){objects.set(key,typeof bytes==='string'?new TextEncoder().encode(bytes):bytes);return {}},
async delete(key:string){objects.delete(key)}
};
return {env:{DB:db,GAME_UPLOADS:r2} as unknown as {DB:D1Database;GAME_UPLOADS:R2Bucket},objects,getState:()=>state};
}
describe('private large ZIP staging',()=>{
it('stores validated files and a private, non-publishable manifest',async()=>{
const fixture=environment(zipSync({'index.html':strToU8('<h1>Game</h1>'),'main.js':strToU8('console.log(1)')}));
const result=await stageInspectedUpload(fixture.env,'session');
expect(result.ok).toBe(true);
expect(fixture.getState()).toBe('staged_private');
const manifest=JSON.parse(new TextDecoder().decode(fixture.objects.get('private-validation/session/manifest.json')));
expect(manifest.approved).toBe(false);
expect(manifest.publishable).toBe(false);
expect(manifest.visibility).toBe('private');
expect(fixture.objects.has('private-validation/session/files/index.html')).toBe(true);
});
it('does not stage or publish corrupt payloads',async()=>{
const zip=zipSync({'index.html':strToU8('hello world')});
const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
zip[30+view.getUint16(26,true)+view.getUint16(28,true)]^=0xff;
const fixture=environment(zip);
const result=await stageInspectedUpload(fixture.env,'session');
expect(result.ok).toBe(false);
expect(fixture.getState()).toBe('inspected');
expect([...fixture.objects.keys()].every(k=>!k.startsWith('private-validation/'))).toBe(true);
});
});
