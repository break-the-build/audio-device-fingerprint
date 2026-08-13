import { describe, expect, it } from 'vitest';

import {
	allPairs,
	analyzeExperiment,
	bestSeparatingThreshold,
	compareSamples,
	histogram,
	repeatabilityReport,
	sampleVector,
	separationReport,
	similarityMatrix
} from '../src/lib/analysis';
import { environmentKeys, environmentVector, fnv1a, hashEmbed } from '../src/lib/environment';
import { describe as describeStats, mean, median, pooledStdDev, stdDev } from '../src/lib/stats';
import type { PairComparison } from '../src/lib/types';
import { fingerprintFromSignal, makeSample, sine } from './fixtures';

describe('descriptive statistics', () => {
	it('computes the mean', () => {
		expect(mean([1, 2, 3, 4])).toBeCloseTo(2.5, 12);
	});

	it('computes the median for odd and even counts', () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it('does not mutate its input while sorting', () => {
		const values = [3, 1, 2];
		median(values);
		expect(values).toEqual([3, 1, 2]);
	});

	it('uses the sample (n-1) standard deviation', () => {
		// Sample sd of [2,4,4,4,5,5,7,9] is 2.13809..., population sd is 2.
		expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
	});

	it('returns NaN for a standard deviation of fewer than two values', () => {
		expect(stdDev([1])).toBeNaN();
	});

	it('describes a data set completely', () => {
		const stats = describeStats([1, 2, 3, 4]);
		expect(stats).toMatchObject({ count: 4, mean: 2.5, median: 2.5, min: 1, max: 4 });
	});

	it('returns an empty description for no data instead of throwing', () => {
		expect(describeStats([]).count).toBe(0);
		expect(describeStats([]).mean).toBeNaN();
	});

	it('pools standard deviations of equal-variance groups back to that variance', () => {
		expect(pooledStdDev([1, 2, 3], [11, 12, 13])).toBeCloseTo(1, 12);
	});
});

describe('environment vectors', () => {
	it('hashes deterministically', () => {
		expect(fnv1a('hello')).toBe(fnv1a('hello'));
		expect(fnv1a('hello')).not.toBe(fnv1a('hellp'));
	});

	it('embeds equal strings identically and different strings differently', () => {
		expect(hashEmbed('Chrome')).toEqual(hashEmbed('Chrome'));
		expect(hashEmbed('Chrome')).not.toEqual(hashEmbed('Firefox'));
	});

	it('keeps embedded dimensions inside [-1, 1] before weighting', () => {
		expect(hashEmbed('anything').every((v) => v >= -1 && v <= 1)).toBe(true);
	});

	it('produces keys parallel to the vector', () => {
		const sample = makeSample('a', 'Laptop', fingerprintFromSignal(sine(440)));
		expect(environmentVector(sample.environment)).toHaveLength(environmentKeys().length);
	});
});

describe('sampleVector', () => {
	const sample = makeSample('a', 'Laptop', fingerprintFromSignal(sine(440)));

	it('uses only audio features in audio mode', () => {
		const vector = sampleVector(sample, 'audio');
		expect(vector.keys).toEqual([...sample.fingerprint.keys]);
		expect(vector.keys.some((k) => k.startsWith('env.'))).toBe(false);
	});

	it('appends environment dimensions in audio+environment mode', () => {
		const audio = sampleVector(sample, 'audio');
		const both = sampleVector(sample, 'audio+environment');
		expect(both.keys.length).toBe(audio.keys.length + environmentKeys().length);
		expect(both.values).toHaveLength(both.keys.length);
	});
});

describe('compareSamples', () => {
	const fingerprint = fingerprintFromSignal(sine(440));
	const a = makeSample('a', 'Laptop', fingerprint);
	const b = makeSample('b', 'Laptop', fingerprint);

	it('scores identical measurements at 1 in both modes', () => {
		expect(compareSamples(a, b, 'audio').normalizedScore).toBeCloseTo(1, 12);
		expect(compareSamples(a, b, 'audio+environment').normalizedScore).toBeCloseTo(1, 12);
	});

	it('separates devices with the same audio but different environments', () => {
		const other = makeSample('c', 'Phone', fingerprint, {
			userAgent: 'Totally Different/2.0',
			platform: 'Other',
			webglRenderer: 'Other GPU',
			screenWidth: 390,
			screenHeight: 844
		});
		expect(compareSamples(a, other, 'audio').normalizedScore).toBeCloseTo(1, 12);
		expect(compareSamples(a, other, 'audio+environment').normalizedScore).toBeLessThan(1);
	});
});

describe('allPairs and similarityMatrix', () => {
	const samples = [
		makeSample('a', 'Laptop', fingerprintFromSignal(sine(440))),
		makeSample('b', 'Laptop', fingerprintFromSignal(sine(440.5))),
		makeSample('c', 'Phone', fingerprintFromSignal(sine(3000, 0.2)))
	];

	it('produces every unordered pair exactly once', () => {
		expect(allPairs(samples, 'audio')).toHaveLength(3);
	});

	it('labels pairs by device group membership', () => {
		const pairs = allPairs(samples, 'audio');
		expect(pairs.filter((p) => p.sameGroup)).toHaveLength(1);
		expect(pairs.filter((p) => !p.sameGroup)).toHaveLength(2);
	});

	it('builds a square, symmetric matrix with a true 1.0 diagonal', () => {
		const matrix = similarityMatrix(samples, 'audio');
		expect(matrix).toHaveLength(3);
		for (let i = 0; i < 3; i++) {
			expect(matrix[i]).toHaveLength(3);
			expect(matrix[i][i]).toBeCloseTo(1, 12);
			for (let j = 0; j < 3; j++) expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 12);
		}
	});

	it('returns no pairs for fewer than two samples', () => {
		expect(allPairs([samples[0]], 'audio')).toHaveLength(0);
	});
});

describe('repeatabilityReport', () => {
	it('summarises pairwise scores across repeated runs', () => {
		const runs = Array.from({ length: 4 }, (_, i) =>
			makeSample(`r${i}`, 'Laptop', fingerprintFromSignal(sine(440)))
		);
		const report = repeatabilityReport(runs, 'audio');

		expect(report.runs).toBe(4);
		// 4 runs -> 6 unordered pairs.
		expect(report.pairs).toHaveLength(6);
		expect(report.normalized.count).toBe(6);
		expect(report.normalized.mean).toBeCloseTo(1, 10);
		expect(report.euclidean.max).toBeCloseTo(0, 10);
	});

	it('reports zero pairs for a single run', () => {
		const report = repeatabilityReport(
			[makeSample('r0', 'Laptop', fingerprintFromSignal(sine(440)))],
			'audio'
		);
		expect(report.pairs).toHaveLength(0);
		expect(report.normalized.count).toBe(0);
	});
});

describe('bestSeparatingThreshold', () => {
	it('finds a perfect split when the distributions do not overlap', () => {
		const { threshold, accuracy } = bestSeparatingThreshold([0.9, 0.92, 0.95], [0.1, 0.2, 0.3]);
		expect(accuracy).toBe(1);
		expect(threshold).toBeGreaterThan(0.3);
		expect(threshold).toBeLessThanOrEqual(0.9);
	});

	it('cannot reach perfect accuracy when the distributions overlap', () => {
		const { accuracy } = bestSeparatingThreshold([0.5, 0.6], [0.55, 0.7]);
		expect(accuracy).toBeLessThan(1);
	});

	it('reports no threshold when one group is empty, rather than a hollow 100%', () => {
		expect(bestSeparatingThreshold([0.99], []).accuracy).toBeNaN();
		expect(bestSeparatingThreshold([], [0.2]).accuracy).toBeNaN();
		expect(bestSeparatingThreshold([], []).threshold).toBeNaN();
	});
});

/** Build a synthetic pair list so verdict logic can be tested directly. */
function pairsFrom(within: number[], between: number[]): PairComparison[] {
	const make = (score: number, sameGroup: boolean, i: number): PairComparison => ({
		aId: `a${i}`,
		bId: `b${i}`,
		aLabel: `a${i}`,
		bLabel: `b${i}`,
		aGroup: 'A',
		bGroup: sameGroup ? 'A' : 'B',
		sameGroup,
		result: { cosineSimilarity: score, euclideanDistance: 1 - score, normalizedScore: score }
	});
	return [
		...within.map((s, i) => make(s, true, i)),
		...between.map((s, i) => make(s, false, i + within.length))
	];
}

describe('separationReport', () => {
	it('reports insufficient data before enough comparisons exist', () => {
		const report = separationReport(pairsFrom([0.99, 0.98], [0.2]));
		expect(report.verdict).toBe('insufficient-data');
		expect(report.notes.join(' ')).toMatch(/at least/);
	});

	it('reports support when the distributions do not overlap', () => {
		const report = separationReport(
			pairsFrom([0.97, 0.98, 0.99, 0.96], [0.3, 0.35, 0.28, 0.4])
		);
		expect(report.verdict).toBe('supported');
		expect(report.meanGap).toBeGreaterThan(0);
		expect(report.overlapMargin).toBeGreaterThan(0);
		expect(report.bestAccuracy).toBe(1);
	});

	it('reports weak support for a large but overlapping separation', () => {
		const report = separationReport(
			pairsFrom([0.9, 0.85, 0.8, 0.6], [0.65, 0.5, 0.45, 0.4])
		);
		expect(report.verdict).toBe('weakly-supported');
		expect(report.overlapMargin).toBeLessThan(0);
		expect(report.effectSize).toBeGreaterThanOrEqual(1);
	});

	it('reports no support when same-device pairs are not more similar', () => {
		const report = separationReport(
			pairsFrom([0.4, 0.5, 0.45, 0.42], [0.8, 0.85, 0.9, 0.86])
		);
		expect(report.verdict).toBe('not-supported');
		expect(report.meanGap).toBeLessThan(0);
	});

	it('reports no support when the separation is small relative to the spread', () => {
		const report = separationReport(
			pairsFrom([0.9, 0.4, 0.7, 0.5], [0.85, 0.35, 0.65, 0.45])
		);
		expect(report.verdict).toBe('not-supported');
		expect(report.effectSize).toBeLessThan(1);
	});
});

describe('analyzeExperiment', () => {
	it('analyses both modes without inventing data', () => {
		const samples = [
			makeSample('a', 'Laptop', fingerprintFromSignal(sine(440))),
			makeSample('b', 'Phone', fingerprintFromSignal(sine(3000, 0.2)))
		];
		const analysis = analyzeExperiment(samples, 'audio');
		expect(analysis.mode).toBe('audio');
		expect(analysis.pairs).toHaveLength(1);
		expect(analysis.separation.verdict).toBe('insufficient-data');
	});
});

describe('histogram', () => {
	it('buckets values into fixed-width bins', () => {
		expect(histogram([0.05, 0.15, 0.95], 10)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 1]);
	});

	it('clamps out-of-range values into the end bins', () => {
		expect(histogram([-5, 5], 2)).toEqual([1, 1]);
	});

	it('returns all-zero bins for no data', () => {
		expect(histogram([], 4)).toEqual([0, 0, 0, 0]);
	});
});
