import { useCallback, useEffect, useRef, useState } from "react";
import { Actions, DockLocation, Layout, Model, type TabNode } from "flexlayout-react";
import { createDefaultModel, loadWorkspace, saveWorkspace, translateLayout } from "./workspace";
import { CameraIcon, GridPanel, InspectorPanel, LibraryPanel, LoupePanel, DiagnosticsPanel } from "./panels";
import { useSession } from "./session";

export default function App() {
  const session = useSession();
  const [model, setModel] = useState(loadWorkspace);
  const [storageError, setStorageError] = useState(false);
  const guide = useRef<HTMLDialogElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const persist = useCallback((current: Model) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setStorageError(!saveWorkspace(current)), 250);
  }, []);
  useEffect(() => {
    const flush = () => { saveWorkspace(model); };
    window.addEventListener("pagehide", flush);
    return () => { clearTimeout(saveTimer.current); window.removeEventListener("pagehide", flush); };
  }, [model]);
  const factory = useCallback((node: TabNode) => {
    switch (node.getComponent()) {
      case "library": return <LibraryPanel />;
      case "grid": return <GridPanel />;
      case "loupe": return <LoupePanel />;
      case "inspector": return <InspectorPanel />;
      case "diagnostics": return <DiagnosticsPanel />;
      default: return <p className="p-5 text-muted">Pannello non disponibile.</p>;
    }
  }, []);
  function resetLayout() {
    clearTimeout(saveTimer.current);
    const next = createDefaultModel();
    setModel(next); setStorageError(!saveWorkspace(next));
  }
  return <div className="app-shell">
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-5">
      <div className="flex min-w-0 items-center gap-3"><span className="brand-mark"><CameraIcon /></span><div><h1 className="text-sm font-semibold tracking-wide">Photo Cull</h1><p className="text-[11px] text-muted">Area di lavoro</p></div><span className="local-badge ml-3 hidden sm:inline-flex"><span />LOCALE</span></div>
      <nav aria-label="Area di lavoro" className="flex items-center gap-2"><button className="primary-button" onClick={session.openFolder} disabled={!session.backend.desktop||session.busy||session.pending>0||!!session.saveError}>Apri cartella RAW</button><button className="toolbar-button" onClick={resetLayout}>Ripristina layout</button><button className="toolbar-button" onClick={() => guide.current?.showModal()}>Guida</button></nav>
    </header>
    {storageError && <p role="status" className="border-b border-line bg-panel px-5 py-2 text-xs text-warning">Impossibile salvare il layout su questo dispositivo.</p>}
    {!session.backend.desktop&&<p className="notice-bar">Apri l’app desktop per analizzare le fotografie.</p>}
    {session.error&&<p role="alert" className="notice-bar text-danger">{session.error}</p>}
    {session.saveError&&<div role="alert" className="notice-bar text-danger">Decisioni non salvate: {session.saveError}<button className="toolbar-button ml-3" onClick={session.retrySave} disabled={session.pending>0}>Riprova salvataggio</button></div>}
    {session.closeBlocked&&<div className="notice-bar text-warning">La chiusura è stata interrotta per proteggere le decisioni non salvate.<button className="toolbar-button ml-3" onClick={()=>{session.dismissClose();session.retrySave();}}>Riprova</button><button className="toolbar-button ml-2" onClick={()=>session.backend.destroy()}>Esci senza salvare</button></div>}
    {session.busy&&<div className="analysis-bar" role="status"><span>{session.progress?`${session.progress.phase==="extract"?"Estrazione anteprime":"Analisi locale"}: ${session.progress.done} / ${session.progress.total}`:"Preparazione dell’analisi…"}</span>{session.progress&&<progress value={session.progress.done} max={Math.max(1,session.progress.total)}/>}<button className="toolbar-button" onClick={session.cancel}>Annulla analisi</button></div>}
    <main aria-label="Pannelli fotografici" className="workspace-host"><Layout model={model} factory={factory} onModelChange={persist} i18nTranslator={translateLayout} supportsPopout={false} constrainFloatPanels={true} realtimeResize={true}
      onRenderTabSet={(node, values) => {
        if (node.getLayoutId() !== Model.MAIN_LAYOUT_ID) {
          values.buttons.push(<button key="dock" className="toolbar-button" onClick={() => {
            model.doAction(Actions.dockFloatToLayout(node.getLayoutId(), "workspace-root", DockLocation.RIGHT, -1));
            persist(model);
          }}>Riaggancia</button>);
        }
      }} /></main>
    <footer className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-t border-line bg-panel px-4 text-[10px] text-muted"><span className="flex items-center gap-2"><span className="status-dot" />{session.pending?`Salvataggio di ${session.pending} decisioni…`:session.saveError?"Salvataggio da riprovare":session.report?"Decisioni salvate localmente":"Pronto"}</span><div className="flex items-center gap-2"><button className="toolbar-button" disabled={!session.canUndo||session.busy} onClick={session.undo} title="Annulla decisione (Ctrl/Cmd+Z)">↶</button><button className="toolbar-button" disabled={!session.canRedo||session.busy} onClick={session.redo} title="Ripeti decisione (Ctrl/Cmd+Shift+Z)">↷</button><span>P Approva · X Scarta · U Reset</span></div></footer>
    <dialog ref={guide} className="workspace-dialog">
      <div className="border-b border-line p-5"><h2 className="text-base font-semibold">Il tuo spazio di selezione</h2><p className="mt-1 text-sm text-muted">Disponi i pannelli come preferisci.</p></div>
      <ol className="list-decimal space-y-4 py-5 pl-10 pr-6 text-sm leading-relaxed text-muted"><li>Apri una cartella RAW e attendi l’analisi locale. Puoi annullarla in qualsiasi momento.</li><li>Seleziona una miniatura. Usa le frecce per navigare, <strong className="text-ink">P</strong> per approvare, <strong className="text-ink">X</strong> per scartare e <strong className="text-ink">U</strong> per azzerare la decisione.</li><li>Usa Ctrl/Cmd+Z per annullare e Ctrl/Cmd+Shift+Z per ripetere. Le scorciatoie non agiscono mentre scrivi in un campo.</li><li>Trascina le schede e i separatori per organizzare lo spazio. Usa <strong className="text-ink">Rendi flottante</strong> e <strong className="text-ink">Riaggancia</strong> per sganciare e reinserire i pannelli.</li><li>Le decisioni si salvano automaticamente sul computer. Nessun file originale viene eliminato.</li></ol>
      <form method="dialog" className="flex justify-end border-t border-line p-4"><button className="primary-button">Ho capito</button></form>
    </dialog>
  </div>;
}
