import { I18nLabelDefaults, Model, type IJsonModel } from "flexlayout-react";
const STORAGE_KEY = "photo-cull.workspace.v1";
export function createDefaultModel() {
  const json: IJsonModel = {
    global: { tabEnableClose: false, tabEnableRename: false, tabEnablePopout: false,
      tabEnableFloat: true, tabEnableFloatIcon: true, tabSetEnableMaximize: true,
      tabSetEnableClose: false, tabSetMinWidth: 100, tabSetMinHeight: 90 },
    layout: { type: "row", id: "workspace-root", children: [
      { type: "tabset", weight: 16, children: [{ type: "tab", id: "library", name: "Libreria", component: "library" }] },
      { type: "row", weight: 64, children: [
        { type: "row", weight: 78, children: [
          { type: "tabset", weight: 43, children: [{ type: "tab", id: "grid", name: "Griglia", component: "grid" }] },
          { type: "tabset", weight: 57, active: true, children: [{ type: "tab", id: "loupe", name: "Loupe", component: "loupe" }] },
        ] },
        { type: "tabset", weight: 22, children: [{ type: "tab", id: "diagnostics", name: "Console", component: "diagnostics" }] },
      ] },
      { type: "tabset", weight: 20, children: [{ type: "tab", id: "inspector", name: "Ispettore", component: "inspector" }] },
    ] },
  };
  return Model.fromJson(json);
}
export function loadWorkspace(): Model {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { const data = JSON.parse(saved); if (data.version === 1 && data.model?.layout) return Model.fromJson(data.model); }
  } catch { /* Storage non disponibile o layout vecchio: usa il predefinito. */ }
  return createDefaultModel();
}
export function saveWorkspace(model: Model): boolean {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, model: model.toJson() })); return true; }
  catch { return false; }
}
const labels: Record<string, string> = {
  "flexlayout.ui.close.tab": "Chiudi pannello", "flexlayout.ui.close.tabset": "Chiudi area",
  "flexlayout.ui.maximize.tabset": "Ingrandisci pannello", "flexlayout.ui.restore.tabset": "Ripristina dimensioni",
  "flexlayout.ui.popout.tab.float": "Rendi flottante",
  "flexlayout.ui.popout.tab": "Apri in finestra",
  "flexlayout.ui.dock.float.to.layout": "Trascina per riagganciare",
  "flexlayout.ui.overflow.menu.tooltip": "Altre azioni", "flexlayout.ui.splitter": "Ridimensiona",
  "flexlayout.ui.menu.float": "Rendi flottante", "flexlayout.ui.menu.float.tabset": "Rendi flottante l’area",
  "flexlayout.ui.menu.maximize": "Ingrandisci pannello", "flexlayout.ui.menu.restore": "Ripristina dimensioni",
};
export function translateLayout(key: string) { return labels[key] ?? I18nLabelDefaults[key] ?? key; }
