import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AnalysisReport, Decision, Progress } from "./types";

export interface Backend {
  desktop: boolean;
  chooseFolder(): Promise<string | null>;
  analyze(inputDir: string, similarity: number, maxGap: number): Promise<AnalysisReport>;
  save(sessionId: string, photoId: string, decision: Decision): Promise<void>;
  cancel(): Promise<void>;
  progress(handler: (progress: Progress) => void): Promise<() => void>;
  onClose(handler: () => Promise<boolean>): Promise<() => void>;
  image(path: string): string;
  destroy(): Promise<void>;
}
export const desktopBackend: Backend = {
  desktop: isTauri(),
  chooseFolder: () => invoke("choose_folder"),
  analyze: (inputDir, similarity, maxGap) => invoke("run_analysis", { inputDir, similarity, maxGap }),
  save: (sessionId, photoId, decision) => invoke("save_review", { sessionId, photoId, decision }),
  cancel: () => invoke("cancel_analysis"),
  progress: handler => listen<Progress>("analysis-progress", event => handler(event.payload)),
  onClose: handler => getCurrentWindow().onCloseRequested(async event => {
    event.preventDefault();
    if (await handler()) await getCurrentWindow().destroy();
  }),
  image: path => convertFileSrc(path),
  destroy: () => getCurrentWindow().destroy(),
};
