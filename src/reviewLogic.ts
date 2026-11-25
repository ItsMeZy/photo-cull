import type { Decision, Photo, ReviewFilter } from "./types";
export function decisionOf(decisions: Record<string, Decision>, id: string): Decision { return decisions[id] ?? "unreviewed"; }
export function filterPhotos(photos: Photo[], decisions: Record<string, Decision>, filter: ReviewFilter, group: string) {
  return photos.filter(photo => (group === "all" || photo.group_id === group) && (filter === "all" || decisionOf(decisions, photo.id) === filter));
}
export function nextSelection(ids: string[], selected: string | null, delta: number): string | null {
  if (!ids.length) return null;
  const index = selected === null ? -1 : ids.indexOf(selected);
  return ids[Math.max(0, Math.min(ids.length - 1, (index < 0 ? 0 : index) + (index < 0 ? 0 : delta)))];
}
export function fileName(path: string) { return path.split(/[\\/]/).pop() ?? path; }
