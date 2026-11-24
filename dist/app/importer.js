import {cleanGeometry, freshId, normalizeResult} from './core.js';
const trim=(value,limit=1800)=>typeof value==='string'?value.slice(0,limit):'';
const when=value=>new Date(Number.isFinite(Date.parse(value))?Date.parse(value):Date.now()).toISOString();
function safeUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function photo(data) {
  if(typeof data!=='string' || data.length>46e6) throw Error('备份中的图片过大或不完整。');
  const matched=/^data:(image\/(?:jpeg|png|webp|gif|avif|heic|heif|bmp|tiff|x-icon|vnd\.microsoft\.icon));base64,([a-zA-Z0-9+/=]+)$/.exec(data);
  if(!matched) throw Error('备份中缺少可恢复的原图。');
  const binary=atob(matched[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:matched[1]});
}
export function importArchive(raw,lenses) {
  if(raw?.format!=='worldlens.observation'||raw.version!==1||!raw.observation)throw Error('请选择 WorldLens 导出的版本 1 JSON。');
  const r=raw.observation,lens=lenses.find(l=>l.id===r.lensId);
  if(!lens)throw Error('这台设备尚未安装备份使用的观察视角。');
  const source=r.source||{};
  const analysis=a=>a?{...normalizeResult(a,lens),origin:a.origin==='editorial'?'editorial':'inference',provider:trim(a.provider,70),source:trim(a.source,64),model:trim(a.model,100),at:when(a.at),lensId:lens.id,lensVersion:trim(a.lensVersion,40),context:trim(a.context),extraIds:(a.extraIds||[]).filter(x=>typeof x==='string').slice(0,2)}:null;
  const corrections=items=>(Array.isArray(items)?items:[]).slice(-200).map(v=>({id:trim(v.id,100),at:when(v.at),before:cleanGeometry(v.before),after:cleanGeometry(v.after)}));
  return {schemaVersion:1,id:freshId(),createdAt:when(r.createdAt),updatedAt:new Date().toISOString(),lensId:lens.id,lensVersion:trim(r.lensVersion,40)||lens.version,title:trim(r.title,90)||'导入的观察',
    source:{kind:source.kind==='case'?'case':'user',caseId:trim(source.caseId,80),credit:trim(source.credit,280),url:safeUrl(source.url),license:trim(source.license,300),licenseUrl:safeUrl(source.licenseUrl),alt:trim(source.alt,300),filename:trim(source.filename||r.photo?.name,220),fingerprint:trim(source.fingerprint,70)},
    original:photo(r.photo?.data),imageUrl:null,context:trim(r.context),reflection:trim(r.reflection),exposed:!!r.exposed,analysis:analysis(r.analysis),corrections:corrections(r.corrections),
    notes:(Array.isArray(r.notes)?r.notes:[]).slice(0,2000).map(n=>({id:freshId(),at:when(n.at),text:trim(n.text),point:cleanGeometry({type:'point',points:[n.point]}).points[0]??null,phase:n.phase==='independent'?'independent':'after-viewing',comparison:trim(n.comparison,30)})),
    extra:(Array.isArray(r.extra)?r.extra:[]).slice(0,2).map(e=>({id:trim(e.id,100)||freshId(),label:trim(e.label,220),at:when(e.at),blob:photo(e.data)})),
    history:(Array.isArray(r.history)?r.history:[]).slice(-100).filter(v=>v.analysis).map(v=>({at:when(v.at),analysis:analysis(v.analysis),corrections:corrections(v.corrections)}))};
}
