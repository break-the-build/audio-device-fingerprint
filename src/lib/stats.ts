/**
 * Descriptive statistics used by every report in the app.
 *
 * Sample standard deviation (n-1) is used throughout, because the collected
 * measurements are a sample of possible runs, not the whole population.
 */

import type { DescriptiveStats } from './types';

export const EMPTY_STATS: DescriptiveStats = {
	count: 0,
	mean: NaN,
	median: NaN,
	stdDev: NaN,
	min: NaN,
	max: NaN
};

export function median(values: readonly number[]): number {
	if (values.length === 0) return NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(values: readonly number[]): number {
	if (values.length === 0) return NaN;
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation. NaN for fewer than two values. */
export function stdDev(values: readonly number[]): number {
	if (values.length < 2) return NaN;
	const m = mean(values);
	const sumSquares = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
	return Math.sqrt(sumSquares / (values.length - 1));
}

export function describe(values: readonly number[]): DescriptiveStats {
	if (values.length === 0) return EMPTY_STATS;
	return {
		count: values.length,
		mean: mean(values),
		median: median(values),
		stdDev: stdDev(values),
		min: Math.min(...values),
		max: Math.max(...values)
	};
}

/**
 * Pooled standard deviation of two groups, as used by Cohen's d.
 * NaN unless both groups have at least two values.
 */
export function pooledStdDev(a: readonly number[], b: readonly number[]): number {
	if (a.length < 2 || b.length < 2) return NaN;
	const sa = stdDev(a);
	const sb = stdDev(b);
	const df = a.length + b.length - 2;
	return Math.sqrt((((a.length - 1) * sa * sa + (b.length - 1) * sb * sb) as number) / df);
}
