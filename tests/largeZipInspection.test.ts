import {describe,it,expect} from 'vitest';
import {zipSync,strToU8} from 'fflate';
import {inspectLargeZip} from '../server/largeZipInspection';
import {verifyLargeZipEntry} from '../server/largeZipEntryVerification';

function fakeBucket(bytes:Uint8Array){
return {
head:async()=>({size:bytes.length}),
get:async(_key:string,opts:{range:{offset:number;length:number}})=>{
const {offset,length}=opts.range;
const slice=bytes.slice(offset,offset+length);
return {body:new ReadableStream({start(c){c.enqueue(slice);c.close()}}),arrayBuffer:async()=>slice.buffer};
}
} as unknown as R2Bucket;
}
describe('large ZIP metadata validation',()=>{
it('accepts a basic ZIP with index.html',async()=>{
const bytes=zipSync({'index.html':strToU8('<h1>Test</h1>')});
const result=await inspectLargeZip(fakeBucket(bytes),'test.zip');
expect(result.ok).toBe(true);
});
it('rejects ZIP without root index.html',async()=>{
const bytes=zipSync({'game/index.html':strToU8('test')});
const result=await inspectLargeZip(fakeBucket(bytes),'test.zip');
expect(result.ok).toBe(false);
});
it('rejects unsupported executable extensions',async()=>{
const bytes=zipSync({'index.html':strToU8('test'),'payload.exe':strToU8('bad')});
const result=await inspectLargeZip(fakeBucket(bytes),'test.zip');
expect(result.ok).toBe(false);
});
it('rejects corrupted local headers',async()=>{
const bytes=zipSync({'index.html':strToU8('test')});
bytes[0]=0;
const result=await inspectLargeZip(fakeBucket(bytes),'test.zip');
expect(result.ok).toBe(false);
});
it('verifies decompressed bytes and CRC32',async()=>{
const bytes=zipSync({'index.html':strToU8('<h1>OK</h1>')});
const result=await verifyLargeZipEntry(fakeBucket(bytes),'test.zip','index.html');
expect(result.ok).toBe(true);
if(result.ok)expect(new TextDecoder().decode(result.data)).toBe('<h1>OK</h1>');
});
it('rejects corrupt compressed payload',async()=>{
const bytes=zipSync({'index.html':strToU8('HELLO WORLD')});
const local=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const offset=30+local.getUint16(26,true)+local.getUint16(28,true);
bytes[offset]^=0xff;
const result=await verifyLargeZipEntry(fakeBucket(bytes),'test.zip','index.html');
expect(result.ok).toBe(false);
});
it('rejects truncated archives',async()=>{
const bytes=zipSync({'index.html':strToU8('test')}).slice(0,-5);
const result=await inspectLargeZip(fakeBucket(bytes),'test.zip');
expect(result.ok).toBe(false);
});
});
