import { memo, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useSession } from "./session";
import { decisionOf, fileName } from "./reviewLogic";
import type { Decision, Photo, ReviewFilter } from "./types";

export function CameraIcon({ large = false }: { large?: boolean }) {
  return <svg aria-hidden="true" width={large ? 40 : 22} height={large ? 40 : 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 7h4l2-3h4l2 3h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="4" /></svg>;
}
function SectionTitle({ children }: { children: ReactNode }) { return <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">{children}</h3>; }
export const decisionLabels: Record<Decision, string> = { unreviewed: "Da valutare", keep: "Approvata", reject: "Scartata" };

export function LibraryPanel() {
  const session = useSession();
  const filters: {id: ReviewFilter; name: string; color: string}[] = [
    {id:"all",name:"Tutte le foto",color:"bg-accent"}, {id:"unreviewed",name:"Da valutare",color:"bg-muted"},
    {id:"keep",name:"Approvate",color:"bg-success"}, {id:"reject",name:"Scartate",color:"bg-danger"},
  ];
  return <section aria-label="Raccolta fotografica" className="panel-scroll">
    <div className="border-b border-line p-4"><SectionTitle>Raccolta</SectionTitle><p className="text-2xl font-light tabular-nums">{session.counts.all} <span className="text-xs font-normal text-muted">fotografie</span></p><p className="mt-2 break-words text-xs leading-relaxed text-muted" title={session.report?.input_dir}>{session.report ? fileName(session.report.input_dir) : "Nessuna cartella aperta"}</p></div>
    <div className="p-3"><SectionTitle>Selezione</SectionTitle><div className="space-y-1">{filters.map(item => <button key={item.id} className={`filter-button ${session.filter===item.id ? "is-active" : ""}`} aria-pressed={session.filter===item.id} onClick={()=>session.setFilter(item.id)}><span className="flex items-center gap-2"><span className={`tiny-dot ${item.color}`} />{item.name}</span><span className="tabular-nums">{session.counts[item.id]}</span></button>)}</div></div>
    <div className="border-t border-line p-3"><label htmlFor="group-filter" className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted">Gruppi · {session.report?.groups.length ?? 0}</label><select id="group-filter" className="text-input w-full" value={session.group} onChange={event=>session.setGroup(event.target.value)}><option value="all">Tutti i gruppi</option>{session.report?.groups.map((group,index)=><option key={group.id} value={group.id}>Gruppo {index+1} · {group.photo_ids.length} foto</option>)}</select></div>
    <div className="border-t border-line p-3"><SectionTitle>Analisi della prossima cartella</SectionTitle><label className="setting-label">Somiglianza <input aria-label="Soglia di somiglianza" className="text-input w-16" type="number" min="0" max="1" step="0.01" value={session.similarity} disabled={session.busy} onChange={event=>session.setSimilarity(Number(event.target.value))} /></label><label className="setting-label mt-3">Intervallo (s) <input aria-label="Intervallo massimo in secondi" className="text-input w-16" type="number" min="0" max="120" step="1" value={session.maxGap} disabled={session.busy} onChange={event=>session.setMaxGap(Number(event.target.value))} /></label><label className="mt-5 flex items-start gap-2 text-[11px] text-muted"><input type="checkbox" checked={session.autoAdvance} onChange={event=>session.setAutoAdvance(event.target.checked)} />Avanza dopo la decisione</label></div>
  </section>;
}

const PhotoTile = memo(function PhotoTile({photo,selected,decision,src,onSelect}: {photo:Photo;selected:boolean;decision:Decision;src:string;onSelect:(id:string)=>void}) {
  return <button className={`photo-tile ${selected?"is-selected":""} ${decision==="reject"?"is-rejected":""}`} aria-label={`${fileName(photo.source_path)}, ${decisionLabels[decision]}, score ${photo.scores.overall}`} aria-pressed={selected} onClick={()=>onSelect(photo.id)}>
    <div className="tile-image"><img src={src} alt="" loading="lazy" decoding="async" draggable={false} /><span className={`decision-badge decision-${decision}`}>{decision==="keep"?"✓":decision==="reject"?"×":"·"}</span>{photo.rank_in_group===1 && <span className="suggestion-badge" title="Score più alto nel gruppo">★</span>}</div>
    <div className="flex items-center justify-between gap-2 px-2 pt-2"><span className="truncate text-[10px]">{fileName(photo.source_path)}</span><span className="text-[10px] tabular-nums text-accent">{photo.scores.overall.toFixed(1)}</span></div><div className="px-2 pb-2 pt-1 text-left text-[9px] text-muted">{decisionLabels[decision]}</div>
  </button>;
});

export function GridPanel() {
  const session=useSession();
  const scroll=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(300);
  const columns=Math.max(1,Math.floor((width-16)/170));
  const rows=Math.ceil(session.visible.length/columns);
  const virtualizer=useVirtualizer({count:rows,getScrollElement:()=>scroll.current,estimateSize:()=>180,overscan:3});
  useEffect(()=>{
    const element=scroll.current; if(!element)return;
    const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));
    observer.observe(element); return()=>observer.disconnect();
  },[]);
  useEffect(()=>session.setColumns(columns),[columns,session.setColumns]);
  const selectedIndex=session.visible.findIndex(photo=>photo.id===session.selectedId);
  useEffect(()=>{if(selectedIndex>=0)virtualizer.scrollToIndex(Math.floor(selectedIndex/columns),{align:"auto"});},[selectedIndex,columns,virtualizer]);
  return <section aria-label="Griglia delle fotografie" className="flex h-full min-h-0 flex-col"><div className="panel-toolbar"><span className="text-xs font-medium">{session.filter==="all"?"Tutte le foto":session.filter==="keep"?"Approvate":session.filter==="reject"?"Scartate":"Da valutare"}</span><span className="text-[10px] text-muted">{session.visible.length} elementi</span></div><div ref={scroll} className="virtual-scroll">
    {session.visible.length ? <div className="virtual-content" style={{height:virtualizer.getTotalSize()}}>{virtualizer.getVirtualItems().map(row=><div key={row.key} className="virtual-row" data-row={row.index} style={{height:180,transform:`translateY(${row.start}px)`,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>{session.visible.slice(row.index*columns,(row.index+1)*columns).map(photo=><PhotoTile key={photo.id} photo={photo} selected={photo.id===session.selectedId} decision={decisionOf(session.decisions,photo.id)} src={session.backend.image(photo.thumbnail_path)} onSelect={session.setSelectedId}/>)}</div>)}</div> : <div className="empty-panel"><CameraIcon large/><h2 className="mt-4 text-sm font-medium">{session.report?"Nessuna foto con questi filtri":"Apri la tua prima raccolta"}</h2><p className="mt-2 text-xs text-muted">{session.report?"Prova un altro filtro o gruppo.":"Scegli una cartella RAW per iniziare la selezione."}</p></div>}
  </div></section>;
}

export function LoupePanel() {
  const session=useSession(); const photo=session.selected;
  const [actualSize,setActualSize]=useState(false);
  const [imageError,setImageError]=useState(false);
  useEffect(()=>{setImageError(false);},[photo?.id]);
  const index=session.ids.indexOf(session.selectedId??"");
  return <section aria-label="Dettaglio fotografia" className="flex h-full min-h-0 flex-col bg-canvas"><div className="panel-toolbar"><span className="min-w-0 truncate text-xs text-muted" title={photo?.source_path}>{photo?fileName(photo.source_path):"Anteprima"}</span><button className="toolbar-button" onClick={()=>setActualSize(value=>!value)} disabled={!photo}>{actualSize?"Adatta":"100%"}</button></div>
    <div className={`loupe-viewport ${actualSize?"actual-size":""}`}>{photo ? imageError?<p role="alert" className="p-6 text-sm text-danger">Anteprima non disponibile. Riapri la cartella per rigenerarla.</p>:<img key={photo.id} src={session.backend.image(photo.preview_path)} alt={fileName(photo.source_path)} className="loupe-image" onError={()=>setImageError(true)} draggable={false}/>:<div className="empty-panel"><CameraIcon large/><p className="mt-4 text-sm">Nessuna foto selezionata</p></div>}</div>
    <div className="review-toolbar"><div className="flex items-center justify-between gap-2"><button className="toolbar-button" aria-label="Foto precedente" onClick={()=>session.navigate(-1)} disabled={session.busy||index<=0}>←</button><span className="text-[10px] text-muted">{index>=0?index+1:0} / {session.visible.length}</span><button className="toolbar-button" aria-label="Foto successiva" onClick={()=>session.navigate(1)} disabled={session.busy||index<0||index>=session.visible.length-1}>→</button></div><div className="mt-2 grid grid-cols-3 gap-1.5"><button className="decision-button keep" disabled={!photo||session.busy} onClick={()=>session.decide("keep")} title="Approva (P)">✓ <span>Approva</span><kbd>P</kbd></button><button className="decision-button reject" disabled={!photo||session.busy} onClick={()=>session.decide("reject")} title="Scarta (X)">× <span>Scarta</span><kbd>X</kbd></button><button className="decision-button" disabled={!photo||session.busy} onClick={()=>session.decide("unreviewed")} title="Da valutare (U)">↺ <span>Reset</span><kbd>U</kbd></button></div></div>
  </section>;
}

export function InspectorPanel() {
  const session=useSession(); const photo=session.selected;
  const values=[{name:"Nitidezza",value:photo?.scores.sharpness.score},{name:"Esposizione",value:photo?.scores.exposure.score},{name:"Composizione",value:photo?.scores.composition.score}];
  const region:Record<string,string>={detected_eye_pair:"Occhi rilevati",largest_face:"Volto principale",whole_frame:"Intera inquadratura"};
  return <section aria-label="Informazioni fotografia" className="panel-scroll p-4"><SectionTitle>Valutazione</SectionTitle><p className="mb-4 text-3xl font-light tabular-nums text-accent">{photo?photo.scores.overall.toFixed(1):"—"}<span className="ml-1 text-[10px] text-muted">/ 100</span></p><div className="space-y-4">{values.map(item=><div key={item.name}><div className="mb-2 flex justify-between text-[11px]"><span>{item.name}</span><span className="text-muted">{item.value==null?"—":item.value.toFixed(1)}</span></div><div className="score-track"><div style={{width:`${item.value??0}%`}}/></div></div>)}</div>
    {photo&&<p className="mt-4 text-[10px] leading-relaxed text-muted">{region[photo.scores.sharpness.region]??photo.scores.sharpness.region} · {photo.scores.face_count} volti<br/>Confidenza {photo.scores.sharpness.confidence==="medium"?"media":"bassa"}</p>}
    <div className="my-5 border-t border-line"/><SectionTitle>File originale</SectionTitle><dl className="space-y-3 text-[10px] text-muted">{[["Nome",photo?fileName(photo.source_path):"—"],["Dimensioni",photo?`${photo.display_width} × ${photo.display_height}`:"—"],["Dimensione",photo?`${(photo.source_size_bytes/1024/1024).toFixed(1)} MB`:"—"],["Ora scatto",photo?.capture_time??"Non disponibile"],["Posizione nel gruppo",photo?String(photo.rank_in_group):"—"],["Decisione",photo?decisionLabels[decisionOf(session.decisions,photo.id)]:"—"]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="mt-1 break-words text-ink">{value}</dd></div>)}</dl><div className="my-5 border-t border-line"/><p className="text-[10px] leading-relaxed text-muted">Gli score aiutano il confronto. Le decisioni sono salvate separatamente: il file RAW rimane invariato.</p></section>;
}

export function DiagnosticsPanel() {
  const session=useSession();
  const [name,setName]=useState("Fotografo");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  async function ping(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);try{setMessage(await invoke<string>("ping_python",{name}));}catch(cause){setMessage(String(cause));}finally{setBusy(false);}}
  return <section aria-label="Diagnostica motore locale" className="panel-scroll px-4 py-3"><div className="mb-2 text-[10px] text-muted">{session.report?`${session.report.photos.length} foto analizzate · ${session.report.groups.length} gruppi · ${(session.report.elapsed_ms/1000).toFixed(2)} s`:"Motore pronto. Apri una cartella RAW."}</div>{session.report?.warnings.map(warning=><p key={warning} className="mb-2 text-[10px] text-warning">{warning}</p>)}{session.report?.errors.map((error,index)=><p key={`${error.source_path}-${index}`} className="mb-1 break-words text-[10px] text-danger">{fileName(error.source_path)}: {error.message}</p>)}<form onSubmit={ping} className="flex flex-wrap items-center gap-2"><label className="sr-only" htmlFor="ping-name">Nome per il test</label><input id="ping-name" className="text-input w-32" value={name} maxLength={100} required onChange={event=>setName(event.target.value)}/><button className="toolbar-button" disabled={!isTauri()||busy||!name.trim()}>Test connessione</button></form>{message&&<p role="status" className="mt-2 break-words font-mono text-[10px] text-muted">{message}</p>}</section>;
}
