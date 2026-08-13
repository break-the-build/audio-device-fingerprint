/**
 * Experiment analysis: pairwise comparisons, the similarity matrix, and the
 * separation between the same-device and different-device distributions.
 *
 * Nothing in this file asserts that the same-device hypothesis is true. It
 * computes what the collected samples actually show and labels the result
 * according to explicit, stated criteria.
 */

import { environmentKeys, environmentVector } from './environment';
import { alignKeyed, compareVectors } from './similarity';
import { describe, mean, pooledStdDev } from './stats';
import type {
	ComparisonMode,
	ComparisonResult,
	ExperimentAnalysis,
	HypothesisVerdict,
	PairComparison,
	RepeatabilityReport,
	Sample,
	SeparationReport
} from './types';

/** Minimum comparisons per group before a verdict is offered at all. */
export const MIN_PAIRS_FOR_VERDICT = 3;

export interface KeyedVector {
	readonly keys: readonly string[];
	readonly values: readonly number[];
}

/**
 * Build the vector a sample contributes in a given comparison mode.
 *
 * In "audio" mode this is purely the normalized audio feature vector. In
 * "audio+environment" mode the environment vector is appended, so the
 * difference between the two modes measures exactly how much the
 * conventional browser attributes were contributing.
 */
export function sampleVector(sample: Sample, mode: ComparisonMode): KeyedVector {
	const keys = [...sample.fingerprint.keys];
	const values = [...sample.fingerprint.features];
	if (mode === 'audio+environment') {
		keys.push(...environmentKeys());
		values.push(...environmentVector(sample.environment));
	}
	return { keys, values };
}

/** Compare two saved samples in the given mode. */
export function compareSamples(
	a: Sample,
	b: Sample,
	mode: ComparisonMode
): ComparisonResult {
	const va = sampleVector(a, mode);
	const vb = sampleVector(b, mode);
	const [x, y] = alignKeyed(va.keys, va.values, vb.keys, vb.values);
	return compareVectors(x, y);
}

/** Every unordered pair of distinct samples, compared. */
export function allPairs(
	samples: readonly Sample[],
	mode: ComparisonMode
): PairComparison[] {
	const pairs: PairComparison[] = [];
	for (let i = 0; i < samples.length; i++) {
		for (let j = i + 1; j < samples.length; j++) {
			const a = samples[i];
			const b = samples[j];
			pairs.push({
				aId: a.id,
				bId: b.id,
				aLabel: a.label,
				bLabel: b.label,
				aGroup: a.deviceGroup,
				bGroup: b.deviceGroup,
				sameGroup: a.deviceGroup === b.deviceGroup,
				result: compareSamples(a, b, mode)
			});
		}
	}
	return pairs;
}

/**
 * Full square matrix of normalized scores. The diagonal is a real
 * self-comparison (a sample against itself), which is 1 by construction --
 * not a placeholder value.
 */
export function similarityMatrix(
	samples: readonly Sample[],
	mode: ComparisonMode
): number[][] {
	return samples.map((a) =>
		samples.map((b) => compareSamples(a, b, mode).normalizedScore)
	);
}

/**
 * Repeatability across repeated fingerprints from one browser: every pairwise
 * comparison between the runs, summarised.
 */
export function repeatabilityReport(
	runs: readonly Sample[],
	mode: ComparisonMode
): RepeatabilityReport {
	const pairs = allPairs(runs, mode).map((p) => p.result);
	return {
		runs: runs.length,
		mode,
		cosine: describe(pairs.map((p) => p.cosineSimilarity)),
		euclidean: describe(pairs.map((p) => p.euclideanDistance)),
		normalized: describe(pairs.map((p) => p.normalizedScore)),
		pairs
	};
}

/**
 * Find the threshold on the normalized score that best separates same-device
 * from different-device pairs, by scanning every midpoint between observed
 * values. Reported as a description of the collected data, not as a
 * recommended production cut-off.
 */
export function bestSeparatingThreshold(
	within: readonly number[],
	between: readonly number[]
): { threshold: number; accuracy: number } {
	// A threshold is only meaningful when there is something on both sides of
	// it. With one group empty, any cut-off scores 100% -- which would be a
	// meaningless number dressed up as a result.
	if (within.length === 0 || between.length === 0) return { threshold: NaN, accuracy: NaN };
	const all = [...within, ...between].sort((a, b) => a - b);

	const candidates = new Set<number>();
	for (let i = 0; i < all.length; i++) {
		candidates.add(all[i]);
		if (i + 1 < all.length) candidates.add((all[i] + all[i + 1]) / 2);
	}

	let best = { threshold: NaN, accuracy: -1 };
	for (const threshold of candidates) {
		// Predict "same device" when score >= threshold.
		const correct =
			within.filter((v) => v >= threshold).length +
			between.filter((v) => v < threshold).length;
		const accuracy = correct / all.length;
		if (accuracy > best.accuracy) best = { threshold, accuracy };
	}
	return best;
}

function verdictFor(
	within: readonly number[],
	between: readonly number[],
	overlapMargin: number,
	effectSize: number,
	meanGap: number
): { verdict: HypothesisVerdict; notes: string[] } {
	const notes: string[] = [];

	if (within.length < MIN_PAIRS_FOR_VERDICT || between.length < MIN_PAIRS_FOR_VERDICT) {
		notes.push(
			`Need at least ${MIN_PAIRS_FOR_VERDICT} within-device and ${MIN_PAIRS_FOR_VERDICT} between-device comparisons before drawing any conclusion (have ${within.length} and ${between.length}).`
		);
		return { verdict: 'insufficient-data', notes };
	}

	if (meanGap <= 0) {
		notes.push(
			'Same-device pairs are on average no more similar than different-device pairs. The collected data does not support the same-device hypothesis.'
		);
		return { verdict: 'not-supported', notes };
	}

	if (overlapMargin > 0) {
		notes.push(
			'The two distributions do not overlap: every same-device comparison scored above every different-device comparison in this data set.'
		);
		return { verdict: 'supported', notes };
	}

	notes.push(
		'The distributions overlap, so no threshold separates them perfectly in this data set.'
	);
	if (Number.isFinite(effectSize) && effectSize >= 1) {
		notes.push(
			`Separation is nonetheless large (effect size ${effectSize.toFixed(2)}), which is consistent with the hypothesis but does not confirm it.`
		);
		return { verdict: 'weakly-supported', notes };
	}
	notes.push(
		'Separation is small relative to the spread within each distribution, so this data does not distinguish the hypothesis from chance.'
	);
	return { verdict: 'not-supported', notes };
}

/** Compare the within-device and between-device score distributions. */
export function separationReport(pairs: readonly PairComparison[]): SeparationReport {
	const within = pairs.filter((p) => p.sameGroup).map((p) => p.result.normalizedScore);
	const between = pairs.filter((p) => !p.sameGroup).map((p) => p.result.normalizedScore);

	const meanGap = mean(within) - mean(between);
	const pooled = pooledStdDev(within, between);
	const effectSize = pooled > 0 ? meanGap / pooled : NaN;
	const overlapMargin =
		within.length > 0 && between.length > 0
			? Math.min(...within) - Math.max(...between)
			: NaN;

	const { threshold, accuracy } = bestSeparatingThreshold(within, between);
	const { verdict, notes } = verdictFor(within, between, overlapMargin, effectSize, meanGap);

	return {
		within: describe(within),
		between: describe(between),
		meanGap,
		effectSize,
		overlapMargin,
		bestThreshold: threshold,
		bestAccuracy: accuracy,
		verdict,
		notes
	};
}

/** Run the whole analysis for a set of samples in one mode. */
export function analyzeExperiment(
	samples: readonly Sample[],
	mode: ComparisonMode
): ExperimentAnalysis {
	const pairs = allPairs(samples, mode);
	return { mode, pairs, separation: separationReport(pairs) };
}

/** Bucket scores into fixed-width bins for a histogram. */
export function histogram(
	values: readonly number[],
	binCount: number,
	min = 0,
	max = 1
): number[] {
	const bins = new Array<number>(binCount).fill(0);
	if (binCount < 1 || max <= min) return bins;
	for (const value of values) {
		const t = (value - min) / (max - min);
		const index = Math.min(binCount - 1, Math.max(0, Math.floor(t * binCount)));
		bins[index]++;
	}
	return bins;
}
