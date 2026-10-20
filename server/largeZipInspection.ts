// Metadata-only ZIP inspection for large R2 objects.
// This does NOT decompress, verify CRCs, or authorize publication.
type Bucket=R2Bucket;
const allowed=new Set(['html','htm','js','mjs','css','json','png','jpg','jpeg','gif','webp','svg','ico','wav','mp3','ogg','mp4','webm','woff','woff2','ttf','txt']);
type Entry={name:string;compressed:number;uncompressed:number;method:number;crc32:number;offset:number};
type Result={ok:true;entries:Entry[];expandedBytes:number}|{ok:false;error:string};
const reject=(error:string):Result=>({ok:false,error});
const MAX_ZIP=100*1024*1024,MAX_EXPANDED=250*1024*1024,MAX_FILE=64*1024*1024,MAX_ENTRIES=500;
async function range(bucket:Bucket,key:string,offset:number,length:number):Promise<Uint8Array>{
const result=await bucket.get(key,{range:{offset,length}});
if(!result||!('body' in result))throw Error('R2 object missing');
const data=new Uint8Array(await result.arrayBuffer());
if(data.length!==length)throw Error('Short R2 range read');
return data;
}
export async function inspectLargeZip(bucket:Bucket,key:string):Promise<Result>{
try{
const head=await bucket.head(key);if(!head||head.size<22||head.size>MAX_ZIP)return reject('ZIPの容量が不正です');
const size=head.size,tailLength=Math.min(size,65557),tail=await range(bucket,key,size-tailLength,tailLength);
const t=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
let eocd=-1;
for(let i=tail.length-22;i>=0;i--){if(t.getUint32(i,true)===0x06054b50&&i+22+t.getUint16(i+20,true)===tail.length){eocd=i;break}}
if(eocd<0)return reject('ZIP終端情報が不正です');
if(t.getUint16(eocd+4,true)!==0||t.getUint16(eocd+6,true)!==0)return reject('分割ZIPには対応していません');
const count=t.getUint16(eocd+10,true),diskCount=t.getUint16(eocd+8,true);
const cdSize=t.getUint32(eocd+12,true),cdOffset=t.getUint32(eocd+16,true);
if(count===0||count>MAX_ENTRIES||count!==diskCount||count===65535||cdSize===0||cdSize>1024*1024||cdOffset===0xffffffff||cdSize===0xffffffff||cdOffset+cdSize!==size-tailLength+eocd)return reject('ZIP中央ディレクトリが不正です');
const cd=await range(bucket,key,cdOffset,cdSize),v=new DataView(cd.buffer,cd.byteOffset,cd.byteLength);
const decoder=new TextDecoder('utf-8',{fatal:true});
const entries:Entry[]=[],seen=new Set<string>();let pos=0,total=0,index=false;
for(let i=0;i<count;i++){
if(pos+46>cd.length||v.getUint32(pos,true)!==0x02014b50)return reject('ZIPエントリが不正です');
const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc32=v.getUint32(pos+16,true),compressed=v.getUint32(pos+20,true),uncompressed=v.getUint32(pos+24,true);
const nameLength=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),disk=v.getUint16(pos+34,true),external=v.getUint32(pos+38,true),offset=v.getUint32(pos+42,true);
const end=pos+46+nameLength+extra+comment;
if(end>cd.length||nameLength===0||compressed===0xffffffff||uncompressed===0xffffffff||offset===0xffffffff||disk!==0)return reject('ZIP64または不正なエントリです');
const name=decoder.decode(cd.subarray(pos+46,pos+46+nameLength)),parts=name.split('/');
if(name.startsWith('/')||name.includes('\\')||name.includes('\0')||parts.some(p=>p==='.'||p==='..')||/^[a-z]:/i.test(name)||name.length>250)return reject('危険なパスが含まれています');
if(flags&1||flags&8||![0,8].includes(method))return reject('暗号化または非対応のZIP形式です');
const unixMode=external>>>16;if((unixMode&0xf000)===0xa000)return reject('シンボリックリンクは使用できません');
if(!name.endsWith('/')){
const lower=name.toLowerCase(),ext=name.split('.').pop()?.toLowerCase()||'';
if(seen.has(lower)||!allowed.has(ext))return reject('重複ファイルまたは許可されていない形式です');
seen.add(lower);if(name==='index.html')index=true;
total+=uncompressed;if(uncompressed>MAX_FILE||total>MAX_EXPANDED||offset>=cdOffset||compressed>MAX_ZIP)return reject('ZIP展開サイズまたは構造が制限を超えています');
entries.push({name,compressed,uncompressed,method,crc32,offset});
}
pos=end;
}
if(pos!==cdSize||!index)return reject('ZIP直下にindex.htmlが必要です');
return {ok:true,entries,expandedBytes:total};
}catch(e){console.error('large_zip.inspect_failed',e);return reject('ZIPの検査に失敗しました')}
}
