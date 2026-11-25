import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { desktopBackend, type Backend } from "./bridge";
import { decisionOf, filterPhotos, nextSelection } from "./reviewLogic";
import type { AnalysisReport, Decision, Progress, ReviewFilter } from "./types";

interface Change { id: string; before: Decision; after: Decision }
function useSessionState(backend: Backend) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [group, setGroup] = useState("all");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pending, setPending] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [similarity, setSimilarity] = useState(0.94);
  const [maxGap, setMaxGap] = useState(3);
  const [columns, setColumns] = useState(1);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const current = useRef({ report, decisions, busy });
  current.current = { report, decisions, busy };
  const queue = useRef<Promise<void>>(Promise.resolve());
  const failed = useRef(new Map<string, Decision>());
  const history = useRef<Change[]>([]);
  const undone = useRef<Change[]>([]);

  const visible = useMemo(() => filterPhotos(report?.photos ?? [], decisions, filter, group), [report, decisions, filter, group]);
  const ids = useMemo(() => visible.map(photo => photo.id), [visible]);
  const photoMap = useMemo(() => new Map((report?.photos ?? []).map(photo => [photo.id, photo])), [report]);
  const selected = selectedId ? photoMap.get(selectedId) ?? null : null;
  const counts = useMemo(() => {
    const value = { all: report?.photos.length ?? 0, unreviewed: 0, keep: 0, reject: 0 };
    for (const photo of report?.photos ?? []) value[decisionOf(decisions, photo.id)]++;
    return value;
  }, [report, decisions]);
  useEffect(() => { if (selectedId && !ids.includes(selectedId)) setSelectedId(ids[0] ?? null); }, [ids, selectedId]);

  const enqueue = useCallback((sessionId: string, id: string, value: Decision) => {
    setPending(count => count + 1);
    queue.current = queue.current.then(async () => {
      try {
        await backend.save(sessionId, id, value);
        if (current.current.decisions[id] === value) failed.current.delete(id);
        if (!failed.current.size) setSaveError("");
      } catch (cause) {
        failed.current.set(id, value); setSaveError(String(cause));
      } finally { setPending(count => count - 1); }
    });
  }, [backend]);

  const apply = useCallback((id: string, value: Decision, record = true) => {
    const state = current.current;
    if (!state.report || state.busy) return;
    const before = decisionOf(state.decisions, id);
    if (before === value) return;
    if (record) {
      history.current.push({ id, before, after: value });
      if (history.current.length > 200) history.current.shift();
      undone.current = [];
    }
    const next = { ...state.decisions, [id]: value };
    current.current.decisions = next; setDecisions(next);
    setHistoryVersion(version => version + 1);
    enqueue(state.report.session_id, id, value);
  }, [enqueue]);

  function decide(value: Decision) {
    if (!selectedId || busy) return;
    const index = ids.indexOf(selectedId);
    const next = ids[index + 1] ?? ids[index - 1] ?? selectedId;
    apply(selectedId, value);
    if (autoAdvance && value !== "unreviewed") setSelectedId(next);
  }
  function undo() {
    if (busy) return;
    const change = history.current.pop();
    if (change) { undone.current.push(change); apply(change.id, change.before, false); setSelectedId(change.id); }
  }
  function redo() {
    if (busy) return;
    const change = undone.current.pop();
    if (change) { history.current.push(change); apply(change.id, change.after, false); setSelectedId(change.id); }
  }
  function navigate(delta: number) { if (!busy) setSelectedId(id => nextSelection(ids, id, delta)); }
  async function openFolder() {
    if (busy || pending || saveError) return;
    setError(""); setBusy(true); current.current.busy = true; setProgress(null);
    try {
      const folder = await backend.chooseFolder();
      if (!folder) return;
      const result = await backend.analyze(folder, similarity, maxGap);
      if (result.protocol_version !== 1 || !Array.isArray(result.photos) || !result.session_id) throw new Error("Risposta del motore incompatibile");
      setReport(result); setDecisions(result.decisions ?? {}); setSelectedId(result.photos[0]?.id ?? null);
      setFilter("all"); setGroup("all"); history.current = []; undone.current = []; failed.current.clear();
      setSaveError(""); setHistoryVersion(version => version + 1);
    } catch (cause) { if (!String(cause).toLowerCase().includes("annullata")) setError(String(cause)); }
    finally { setBusy(false); current.current.busy = false; setProgress(null); }
  }
  function retrySave() {
    if (!report || pending) return;
    for (const [id, value] of [...failed.current]) enqueue(report.session_id, id, value);
  }
  async function cancel() {
    try { await backend.cancel(); } catch (cause) { setError(String(cause)); }
  }
  useEffect(() => {
    if (!backend.desktop) return;
    let disposed = false; const releases: (() => void)[] = [];
    backend.progress(value => { if (current.current.busy) setProgress(value); }).then(off => { if (disposed) off(); else releases.push(off); }).catch(cause => setError(String(cause)));
    backend.onClose(async () => {
      try { await backend.cancel(); } catch (cause) { setError(String(cause)); return false; }
      await queue.current;
      if (failed.current.size) { setCloseBlocked(true); return false; }
      return true;
    }).then(off => { if (disposed) off(); else releases.push(off); }).catch(cause => setError(String(cause)));
    return () => { disposed = true; releases.forEach(off => off()); };
  }, [backend]);

  const actions = useRef({ decide, navigate, undo, redo });
  actions.current = { decide, navigate, undo, redo };
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], dialog[open]') || event.altKey) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault(); event.shiftKey ? actions.current.redo() : actions.current.undo(); return;
      }
      if (event.ctrlKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      const choice = ({ p: "keep", x: "reject", u: "unreviewed" } as Record<string, Decision>)[key];
      const delta = ({ arrowright: 1, arrowleft: -1, arrowdown: columns, arrowup: -columns } as Record<string, number>)[key];
      if (choice) { event.preventDefault(); actions.current.decide(choice); }
      else if (delta !== undefined) { event.preventDefault(); actions.current.navigate(delta); }
    }
    document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown);
  }, [columns]);

  return { backend, report, decisions, selectedId, selected, setSelectedId, filter, setFilter, group, setGroup,
    busy, progress, error, saveError, pending, autoAdvance, setAutoAdvance, similarity, setSimilarity, maxGap, setMaxGap,
    columns, setColumns, visible, ids, counts, openFolder, decide, navigate, undo, redo, retrySave,
    canUndo: historyVersion >= 0 && history.current.length > 0, canRedo: undone.current.length > 0,
    closeBlocked, dismissClose: () => setCloseBlocked(false), cancel };
}
type Session = ReturnType<typeof useSessionState>;
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children, backend = desktopBackend }: { children: ReactNode; backend?: Backend }) {
  const state = useSessionState(backend);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error("SessionProvider assente"); return value; }
