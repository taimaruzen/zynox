import {Inflate} from 'fflate';
import {inspectLargeZip} from './largeZipInspection';
import type {LargeZipEntry} from './largeZipInspection';

// Private validation helper for one ZIP entry. Not wired to public game approval.
// The per-entry limit is deliberately conservative until streaming-to-R2 is ready.
const CHUNK=256*1024,MAX_OUTPUT=64*1024*1024;
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
function crcUpdate(crc:number,data:Uint8Array){for(let i=0;i<data.length;i++)crc=table[(crc^data[i])&255]^(crc>>>8);return crc>>>0}
async function readRange(bucket:R2Bucket,key:string,offset:number,length:number){
const object=await bucket.get(key,{range:{offset,length}});
if(!object||!('body' in object))throw Error('R2からZIPデータを取得できません');
const bytes=new Uint8Array(await object.arrayBuffer());
if(bytes.byteLength!==length)throw Error('ZIPの読み取りサイズが一致しません');
return bytes;
}
export async function verifyLargeZipEntry(bucket:R2Bucket,key:string,name:string,prevalidatedEntry?:LargeZipEntry):Promise<{ok:true;data:Uint8Array}|{ok:false;error:string}>{
try{
let entry=prevalidatedEntry;
if(entry&&entry.name!==name)return {ok:false,error:'検証対象のファイル名が一致しません'};
if(!entry){const inspection=await inspectLargeZip(bucket,key);if(!inspection.ok)return inspection;entry=inspection.entries.find(e=>e.name===name)}
if(!entry)return {ok:false,error:'ZIP内に指定ファイルがありません'};
if(entry.uncompressed>MAX_OUTPUT)return {ok:false,error:'このファイルは検証可能なサイズを超えています'};
const header=await readRange(bucket,key,entry.offset,30);
const view=new DataView(header.buffer,header.byteOffset,header.byteLength);
const start=entry.offset+30+view.getUint16(26,true)+view.getUint16(28,true);
let total=0,crc=0xffffffff;
const chunks:Uint8Array[]=[];
const collect=(chunk:Uint8Array)=>{
total+=chunk.byteLength;
if(total>entry.uncompressed||total>MAX_OUTPUT)throw Error('展開後のサイズ制限を超えています');
crc=crcUpdate(crc,chunk);
chunks.push(chunk.slice());
};
if(entry.method===0){
for(let offset=0;offset<entry.compressed;offset+=CHUNK)collect(await readRange(bucket,key,start+offset,Math.min(CHUNK,entry.compressed-offset)));
}else{
let failure:Error|null=null;
const inflate=new Inflate((chunk, _final)=>{if(failure)return;try{collect(chunk)}catch(e){failure=e instanceof Error?e:new Error('展開失敗')}});
for(let offset=0;offset<entry.compressed;offset+=CHUNK){
const bytes=await readRange(bucket,key,start+offset,Math.min(CHUNK,entry.compressed-offset));
inflate.push(bytes,offset+bytes.length===entry.compressed);
if(failure)throw failure;
}
if(entry.compressed===0)inflate.push(new Uint8Array(),true);
if(failure)throw failure;
}
if(total!==entry.uncompressed||((crc^0xffffffff)>>>0)!==entry.crc32)return {ok:false,error:'展開サイズまたはCRC32が一致しません'};
const data=new Uint8Array(total);let cursor=0;for(const chunk of chunks){data.set(chunk,cursor);cursor+=chunk.length}
return {ok:true,data};
}catch(e){console.error('large_zip.entry_verification_failed',e);return {ok:false,error:'ZIPファイルの展開検証に失敗しました'}}
}
