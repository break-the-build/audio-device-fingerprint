/**
 * Display formatting. Measurements that do not exist are shown as an em dash
 * rather than as 0, so a missing value can never be mistaken for a measured one.
 */

export const NO_VALUE = '—';

export function fixed(value: number, digits = 4): string {
	return Number.isFinite(value) ? value.toFixed(digits) : NO_VALUE;
}

export function percent(value: number, digits = 1): string {
	return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : NO_VALUE;
}

/** Map a score in [0, 1] to a background colour for the matrix heatmap. */
export function heatColor(score: number): string {
	if (!Number.isFinite(score)) return 'transparent';
	const t = Math.min(1, Math.max(0, score));
	// Blue (low) through to green (high), with lightness carrying the value too
	// so the scale is still readable without colour vision.
	const hue = 210 + (140 - 210) * t;
	const lightness = 18 + 30 * t;
	return `hsl(${hue.toFixed(0)} 60% ${lightness.toFixed(0)}%)`;
}

export function shortTime(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
