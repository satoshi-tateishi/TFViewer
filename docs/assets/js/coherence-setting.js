const STORAGE_KEY = 'tfviewer:coherenceThreshold';

export const DEFAULT_COHERENCE_THRESHOLD = 0.5;

// 平滑化設定と同様、コヒーレンス閾値もアプリ全体でグローバルに1つだけ持つ。
export function getCoherenceThreshold() {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : DEFAULT_COHERENCE_THRESHOLD;
}

export function setCoherenceThreshold(threshold) {
  localStorage.setItem(STORAGE_KEY, String(threshold));
}
