import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {randomFillSync} from 'node:crypto';
import {inspectLargeZip} from '../server/largeZipInspection';

// A 95 MiB incompressible fixture exercises real archive offsets and R2 range reads.
// Stored video assets are allowed; the archive is never published.
describe('95 MiB ZIP metadata boundary',()=>{
it('accepts an allowed 95 MiB ZIP without loading its full body through R2.get',async()=>{
const first=new Uint8Array(48*1024*1024),second=new Uint8Array(47*1024*1024);
randomFillSync(first);randomFillSync(second);
const zip=zipSync({'index.html':[strToU8('<!doctype html><title>Load test</title>'),{level:0}],'assets/a.webm':[first,{level:0}],'assets/b.webm':[second,{level:0}]});
expect(zip.length).toBeGreaterThan(94*1024*1024);
expect(zip.length).toBeLessThanOrEqual(100*1024*1024);
let maxRead=0,readCount=0;
const bucket={
head:async()=>({size:zip.length}),
get:async(_key:string,options:{range:{offset:number;length:number}})=>{
const {offset,length}=options.range;
maxRead=Math.max(maxRead,length);readCount++;
if(length>1024*1024)throw Error('Unbounded R2 read');
const bytes=zip.slice(offset,offset+length);
return {arrayBuffer:async()=>bytes.buffer,body:new ReadableStream({start(c){c.enqueue(bytes);c.close()}})};
}
} as unknown as R2Bucket;
const result=await inspectLargeZip(bucket,'test.zip');
expect(result.ok).toBe(true);
if(result.ok){expect(result.entries).toHaveLength(3);expect(result.expandedBytes).toBeGreaterThan(94*1024*1024)}
expect(maxRead).toBeLessThanOrEqual(1024*1024);
expect(readCount).toBeGreaterThan(1);
},120000);
});
