import { DEFAULT_SMOOTHING_FRACTION } from './trf-parser.js';

const STORAGE_KEY = 'tfviewer:smoothingFraction';

// マイクごとに平滑化がばらつくと比較の一貫性が崩れるため、
// 平滑化設定はアプリ全体でグローバルに1つだけ持つ（ブラウザにlocalStorageで保存）。
export function getSmoothingFraction() {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_SMOOTHING_FRACTION;
}

export function setSmoothingFraction(fraction) {
  localStorage.setItem(STORAGE_KEY, String(fraction));
}
