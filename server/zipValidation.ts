import { unzipSync } from 'fflate';
const allowed=new Set(['html','htm','js','mjs','css','json','png','jpg','jpeg','gif','webp','svg','ico','wav','mp3','ogg','mp4','webm','woff','woff2','ttf','txt']);
export function validateGameZip(buffer:ArrayBuffer):{ok:true;files:number}|{ok:false;error:string}{
const b=new Uint8Array(buffer),view=new DataView(buffer);
const fail=(error:string)=>({ok:false as const,error});
if(b.byteLength<22)return fail('ZIPファイルが壊れています');
let eocd=-1;
for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break}}
if(eocd<0)return fail('ZIPの終端情報がありません');
const count=view.getUint16(eocd+10,true),centralSize=view.getUint32(eocd+12,true),offset=view.getUint32(eocd+16,true);
if(!count||count>100||centralSize===0||offset+centralSize>eocd)return fail('ZIP内のファイル数または構造が不正です');
const decoder=new TextDecoder('utf-8',{fatal:true});let pos=offset,total=0,hasIndex=false;
const seen=new Set<string>();
try{for(let i=0;i<count;i++){
if(pos+46>b.length||view.getUint32(pos,true)!==0x02014b50)return fail('ZIPのファイル情報が不正です');
const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),uncompressed=view.getUint32(pos+24,true);
const nameLen=view.getUint16(pos+28,true),extraLen=view.getUint16(pos+30,true),commentLen=view.getUint16(pos+32,true);
const external=view.getUint32(pos+38,true),nameEnd=pos+46+nameLen;
if(nameEnd>b.length)return fail('ZIPのファイル名が不正です');
const name=decoder.decode(b.subarray(pos+46,nameEnd)),parts=name.split('/');
if(!name||name.startsWith('/')||name.includes('\\')||name.includes('\0')||parts.some(x=>x==='..'||x==='.')||/^[a-z]:/i.test(name))return fail('危険なファイルパスが含まれています');
if(flags&1||![0,8].includes(method))return fail('暗号化または非対応の圧縮方式です');
const unixMode=external>>>16;if((unixMode&0xf000)===0xa000)return fail('シンボリックリンクは使用できません');
if(!name.endsWith('/')){
if(seen.has(name.toLowerCase()))return fail('重複するファイル名があります');
seen.add(name.toLowerCase());
const ext=name.split('.').pop()?.toLowerCase()||'';
if(!allowed.has(ext))return fail('許可されていないファイル形式が含まれています');
total+=uncompressed;if(uncompressed>8*1024*1024||total>20*1024*1024)return fail('展開後の容量が制限を超えています');
if(name==='index.html')hasIndex=true;
}
pos=nameEnd+extraLen+commentLen;
if(pos>offset+centralSize)return fail('ZIPの構造が不正です');
}
if(pos!==offset+centralSize||!hasIndex)return fail('ZIP直下にindex.htmlが必要です');
const files=unzipSync(b);
const names=Object.keys(files).filter(x=>!x.endsWith('/'));
if(names.length!==seen.size||names.some(n=>!seen.has(n.toLowerCase())))return fail('ZIPの内部情報が一致しません');
let actual=0;for(const file of Object.values(files)){actual+=file.byteLength;if(actual>20*1024*1024)return fail('展開後の容量が制限を超えています')}
return {ok:true,files:names.length};
}catch{return fail('ZIPの展開または検証に失敗しました')}
}
