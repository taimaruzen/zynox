import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {inspectLargeZip} from '../server/largeZipInspection';
import {verifyLargeZipEntry} from '../server/largeZipEntryVerification';

function bucket(data:Uint8Array):R2Bucket{
return {head:async()=>({size:data.byteLength}),get:async(_key:string,options:{range:{offset:number;length:number}})=>{const bytes=data.slice(options.range.offset,options.range.offset+options.range.length);return {arrayBuffer:async()=>bytes.buffer,body:new ReadableStream({start(c){c.enqueue(bytes);c.close()}})}}} as unknown as R2Bucket;
}
describe('private ZIP verification',()=>{
it('verifies a normal ZIP entry using inspected metadata',async()=>{
const bytes=zipSync({'index.html':strToU8('<h1>hello</h1>')});
const inspection=await inspectLargeZip(bucket(bytes),'test.zip');
expect(inspection.ok).toBe(true);
if(!inspection.ok)return;
const result=await verifyLargeZipEntry(bucket(bytes),'test.zip','index.html',inspection.entries[0]);
expect(result.ok).toBe(true);
if(result.ok)expect(new TextDecoder().decode(result.data)).toBe('<h1>hello</h1>');
});
it('rejects a corrupted compressed payload by CRC or inflation',async()=>{
const bytes=zipSync({'index.html':strToU8('Hello Zynox!')});
const inspection=await inspectLargeZip(bucket(bytes),'test.zip');
expect(inspection.ok).toBe(true);
if(!inspection.ok)return;
const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const payload=30+view.getUint16(26,true)+view.getUint16(28,true);
bytes[payload]^=0xff;
const result=await verifyLargeZipEntry(bucket(bytes),'test.zip','index.html',inspection.entries[0]);
expect(result.ok).toBe(false);
});
it('rejects mismatched prevalidated file name',async()=>{
const bytes=zipSync({'index.html':strToU8('OK')});
const inspection=await inspectLargeZip(bucket(bytes),'test.zip');
if(!inspection.ok)throw Error('fixture failed');
const result=await verifyLargeZipEntry(bucket(bytes),'test.zip','other.js',inspection.entries[0]);
expect(result.ok).toBe(false);
});
});
