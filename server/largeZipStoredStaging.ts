import type {LargeZipEntry} from './largeZipInspection';
const CHUNK=256*1024;
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
function update(crc:number,bytes:Uint8Array){for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return crc>>>0}
async function getBytes(bucket:R2Bucket,key:string,offset:number,length:number){
const object=await bucket.get(key,{range:{offset,length}});
if(!object||!('body' in object))throw Error('R2 range not found');
const bytes=new Uint8Array(await object.arrayBuffer());
if(bytes.byteLength!==length)throw Error('Truncated R2 range');
return bytes;
}
/** Verify stored (uncompressed) ZIP payload in small bounded reads before private R2 copy. */
export async function stageStoredZipEntry(bucket:R2Bucket,zipKey:string,destination:string,entry:LargeZipEntry,contentType:string){
if(entry.method!==0||entry.compressed!==entry.uncompressed||entry.uncompressed>64*1024*1024)throw Error('Unsupported stored ZIP entry');
const header=await getBytes(bucket,zipKey,entry.offset,30);
const view=new DataView(header.buffer,header.byteOffset,header.byteLength);
if(view.getUint32(0,true)!==0x04034b50)throw Error('Invalid ZIP local header');
const start=entry.offset+30+view.getUint16(26,true)+view.getUint16(28,true);
let crc=0xffffffff;
for(let offset=0;offset<entry.compressed;offset+=CHUNK){
const bytes=await getBytes(bucket,zipKey,start+offset,Math.min(CHUNK,entry.compressed-offset));
crc=update(crc,bytes);
}
if(((crc^0xffffffff)>>>0)!==entry.crc32)throw Error('ZIP CRC32 mismatch');
if(entry.compressed===0){
await bucket.put(destination,new Uint8Array(),{httpMetadata:{contentType},customMetadata:{visibility:'private-unverified'}});
return;
}
const object=await bucket.get(zipKey,{range:{offset:start,length:entry.compressed}});
if(!object||!('body' in object))throw Error('R2 payload not found');
await bucket.put(destination,object.body,{httpMetadata:{contentType},customMetadata:{visibility:'private-unverified'}});
}
