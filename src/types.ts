export type Decision = "unreviewed" | "keep" | "reject";
export type ReviewFilter = "all" | Decision;
export interface Photo {
  id: string; source_path: string; preview_path: string; thumbnail_path: string;
  width: number; height: number; display_width: number; display_height: number;
  group_id: string; rank_in_group: number; capture_time: string | null;
  sequence_time_source: string; source_size_bytes: number;
  scores: { overall: number; face_count: number;
    sharpness: { score: number; region: string; confidence: string };
    exposure: { score: number; mean_luminance: number; shadow_clipping_fraction: number; highlight_channel_clipping_fraction: number };
    composition: { score: number | null; method: string; confidence: string } };
}
export interface AnalysisReport {
  protocol_version: number; session_id: string; input_dir: string; status: string;
  photos: Photo[]; groups: {id: string; photo_ids: string[]; suggested_photo_id: string}[];
  errors: { source_path: string; code: string; message: string }[]; warnings: string[];
  decisions: Record<string, Decision>; elapsed_ms: number; review_path?: string;
}
export interface Progress { phase: "extract" | "analyze"; done: number; total: number }
