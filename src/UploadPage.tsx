import{useEffect,useRef,useState}from'react';import{ArrowLeft,UploadCloud,ImagePlus}from'lucide-react';
export default function UploadPage({onBack,onDone}:{onBack:()=>void;onDone:()=>void}){
const[title,setTitle]=useState(''),[description,setDescription]=useState(''),[category,setCategory]=useState('アクション');
const[orientation,setOrientation]=useState('auto');const[file,setFile]=useState<File|null>(null),[thumbnail,setThumbnail]=useState<File|null>(null),[preview,setPreview]=useState('');
const[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[compressing,setCompressing]=useState(false),[uploadedId,setUploadedId]=useState<string|null>(null);const selectionVersion=useRef(0);
useEffect(()=>{if(!thumbnail){setPreview('');return}const url=URL.createObjectURL(thumbnail);setPreview(url);return()=>URL.revokeObjectURL(url)},[thumbnail]);
const MAX_IMAGE=2*1024*1024;
async function compressImage(source:File):Promise<File>{
if(source.size>25*1024*1024)throw Error('元画像は25MB以下にしてください');
const bitmap=await createImageBitmap(source);
try{
if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>80_000_000)throw Error('画像の解像度が大きすぎます');
let maxSide=1920;
for(let sizeAttempt=0;sizeAttempt<5;sizeAttempt++){
const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
const ctx=canvas.getContext('2d');if(!ctx)throw Error('画像変換に対応していないブラウザです');
ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
for(const quality of [.86,.72,.58,.44]){
const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
if(blob&&blob.type==='image/webp'&&blob.size<=MAX_IMAGE)return new File([blob],source.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
}
maxSide=Math.round(maxSide*.75);
}
throw Error('画像を2MB以下に圧縮できませんでした');
}finally{bitmap.close()}
}
async function selectThumbnail(next:File|null){
const version=++selectionVersion.current;setError('');setNotice('');
if(!next){setThumbnail(null);return}
if(!['image/png','image/jpeg','image/webp'].includes(next.type)||next.size===0){setError('PNG・JPEG・WebP画像を選択してください');return}
setCompressing(true);
try{
const converted=next.size>MAX_IMAGE?await compressImage(next):next;
if(version!==selectionVersion.current)return;
setThumbnail(converted);

}catch(e){if(version===selectionVersion.current)setError(e instanceof Error?e.message:'画像を圧縮できませんでした')}
finally{if(version===selectionVersion.current)setCompressing(false)}
}
async function saveThumbnail(id:string){if(!thumbnail)return;const form=new FormData();form.append('image',thumbnail);const response=await fetch('/api/thumbnails/'+id,{method:'POST',body:form});let data:any;try{data=await response.json()}catch{throw Error('画像保存の応答を読み取れませんでした')}if(!response.ok)throw Error(data.error||'画像を保存できませんでした')}
async function submit(e:React.FormEvent){e.preventDefault();if((!file&&!uploadedId)||compressing)return;setBusy(true);setError('');setNotice('');try{
let id=uploadedId;
if(!id){const form=new FormData();form.append('title',title);form.append('description',description);form.append('category',category);form.append('orientation',orientation);form.append('file',file!);const res=await fetch('/api/games/upload',{method:'POST',body:form});const data=await res.json();if(!res.ok)throw Error(data.error||'投稿できませんでした');id=data.id;setUploadedId(id)}
if(thumbnail){try{await saveThumbnail(id!)}catch(e){setNotice('ゲーム本体は審査待ちとして保存済みです。サムネイルだけ保存できませんでした。再試行するか、マイページから後で設定できます。');setError(e instanceof Error?e.message:'サムネイルの保存に失敗しました');return}}
onDone()
}catch(e){setError(e instanceof Error?e.message:'投稿できませんでした')}finally{setBusy(false)}}
return <main className="max-w-3xl mx-auto px-5 py-12 text-white"><button onClick={onBack} className="text-neutral-400 hover:text-white flex gap-2 items-center mb-8"><ArrowLeft size={18}/> 戻る</button><h1 className="text-3xl font-bold mb-3">ゲームを投稿する</h1><p className="text-neutral-400 mb-8">HTML5・JavaScriptゲームのZIPとサムネイルをアップロード。投稿後は審査待ちとなり、承認後に公開されます。</p><form onSubmit={submit} className="rounded-2xl bg-[#222] p-6 sm:p-9 space-y-6">
<label className="block text-sm">ゲームタイトル（80文字以内）<input required disabled={!!uploadedId} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} className="block mt-2 w-full bg-[#333] rounded-lg p-3 outline-none disabled:opacity-60"/></label>
<label className="block text-sm">説明（2000文字以内）<textarea disabled={!!uploadedId} maxLength={2000} rows={4} value={description} onChange={e=>setDescription(e.target.value)} className="block mt-2 w-full bg-[#333] rounded-lg p-3 outline-none disabled:opacity-60"/></label>
<label className="block text-sm">カテゴリ<select disabled={!!uploadedId} value={category} onChange={e=>setCategory(e.target.value)} className="block mt-2 w-full bg-[#333] rounded-lg p-3 disabled:opacity-60">{['アクション','パズル','レース','シューティング','その他'].map(c=><option key={c}>{c}</option>)}</select></label><label className="block text-sm">推奨画面方向<select value={orientation} disabled={!!uploadedId} onChange={e=>setOrientation(e.target.value)} className="mt-2 block w-full rounded-lg bg-[#333] p-3"><option value="auto">自動（縦・横に対応）</option><option value="portrait">縦向き推奨</option><option value="landscape">横向き推奨</option></select><span className="mt-2 block text-xs text-neutral-400">画面方向は推奨設定です。ゲーム自体の画面対応も必要です。</span></label>
<label className="block border border-dashed border-white/30 rounded-xl p-6 text-center cursor-pointer"><UploadCloud className="mx-auto mb-3 text-indigo-300" size={36}/><span className="block text-sm">{file?file.name:'ゲームZIPを選択（最大10MB）'}</span><input required={!uploadedId} disabled={!!uploadedId} type="file" accept=".zip,application/zip" className="block mx-auto mt-4 max-w-full text-sm" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
<div className="rounded-xl border border-white/15 bg-[#292929] p-5"><p className="mb-3 flex items-center gap-2 font-semibold"><ImagePlus size={20} className="text-indigo-300"/> サムネイル画像 <span className="text-xs font-normal text-neutral-400">任意・最大2MB</span></p><label className="relative block cursor-pointer overflow-hidden rounded-lg border-2 border-dashed border-indigo-400/50 hover:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-400">{preview?<img src={preview} alt="選択したサムネイルのプレビュー" className="aspect-video w-full object-cover"/>:<div className="grid aspect-video place-items-center bg-gradient-to-br from-indigo-950 to-slate-800"><div className="flex flex-col items-center gap-3 text-indigo-200"><ImagePlus size={36}/><span className="text-sm font-semibold">ここをクリックして画像を選択</span></div></div>}<input aria-label="サムネイル画像を選択" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={e=>{void selectThumbnail(e.target.files?.[0]||null);e.currentTarget.value=''}}/></label><p className="mt-3 text-sm">{compressing?'画像を圧縮しています…':thumbnail?'選択中：'+thumbnail.name+'（'+(thumbnail.size/1024).toFixed(0)+'KB）':'画像はまだ選択されていません'}</p><p className="mt-2 text-xs text-neutral-400">PNG・JPEG・WebP対応。2MBを超える画像は自動でWebPに圧縮します。推奨比率は16:9です。</p></div>
{notice&&<p role="status" className="text-amber-300 text-sm">{notice}</p>}{error&&<p role="alert" className="text-red-400 text-sm">{error}</p>}
<button disabled={busy||compressing||(!file&&!uploadedId)} className="w-full bg-indigo-500 rounded-lg p-3 font-bold disabled:opacity-50">{busy?'保存中…':uploadedId?'サムネイル保存を再試行する':'審査待ちとして投稿する'}</button>{uploadedId&&<button type="button" onClick={onDone} className="w-full text-sm text-neutral-300 underline">サムネイルは後で設定してマイページへ</button>}
</form></main>}
