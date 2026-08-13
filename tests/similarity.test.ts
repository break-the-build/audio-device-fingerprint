import { describe, expect, it } from 'vitest';

import {
	VectorLengthError,
	alignKeyed,
	combineScores,
	compareFingerprints,
	compareVectors,
	cosineSimilarity,
	euclideanDistance,
	magnitude,
	normalizedEuclideanDistance
} from '../src/lib/similarity';
import { FINGERPRINT_VERSION } from '../src/lib/types';
import type { AudioFingerprint } from '../src/lib/types';
import { fingerprintFromSignal, sine } from './fixtures';

describe('cosineSimilarity', () => {
	it('returns 1 for identical vectors', () => {
		expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 12);
	});

	it('returns 1 for parallel vectors of different magnitude', () => {
		expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
	});

	it('returns 0 for orthogonal vectors', () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 12);
	});

	it('returns -1 for opposite vectors', () => {
		expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 12);
	});

	it('returns 0 when either vector is the zero vector', () => {
		expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
		expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
	});

	it('stays inside [-1, 1] despite floating point error', () => {
		const a = [1e-8, 1e-8, 1e-8];
		expect(cosineSimilarity(a, a)).toBeLessThanOrEqual(1);
		expect(cosineSimilarity(a, a)).toBeGreaterThanOrEqual(-1);
	});

	it('rejects mismatched lengths', () => {
		expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(VectorLengthError);
	});

	it('rejects empty vectors', () => {
		expect(() => cosineSimilarity([], [])).toThrow(/empty/);
	});
});

describe('euclideanDistance', () => {
	it('is 0 for identical vectors', () => {
		expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
	});

	it('matches the 3-4-5 triangle', () => {
		expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5, 12);
	});

	it('is symmetric', () => {
		const a = [1, -2, 3.5];
		const b = [0.5, 4, -1];
		expect(euclideanDistance(a, b)).toBeCloseTo(euclideanDistance(b, a), 12);
	});

	it('satisfies the triangle inequality', () => {
		const a = [0, 0];
		const b = [3, 4];
		const c = [1, 7];
		expect(euclideanDistance(a, c)).toBeLessThanOrEqual(
			euclideanDistance(a, b) + euclideanDistance(b, c) + 1e-12
		);
	});

	it('divides by sqrt(dimension) when normalized', () => {
		expect(normalizedEuclideanDistance([0, 0, 0, 0], [1, 1, 1, 1])).toBeCloseTo(1, 12);
	});
});

describe('magnitude', () => {
	it('computes the L2 norm', () => {
		expect(magnitude([3, 4])).toBeCloseTo(5, 12);
	});
});

describe('combineScores', () => {
	it('is 1 for a perfect match', () => {
		expect(combineScores(1, 0)).toBeCloseTo(1, 12);
	});

	it('decreases as distance grows', () => {
		expect(combineScores(1, 0.5)).toBeLessThan(combineScores(1, 0.1));
	});

	it('decreases as cosine similarity falls', () => {
		expect(combineScores(0.2, 0.1)).toBeLessThan(combineScores(0.9, 0.1));
	});

	it('stays within [0, 1]', () => {
		for (const cosine of [-1, -0.5, 0, 0.5, 1]) {
			for (const distance of [0, 0.5, 10, 1000]) {
				const score = combineScores(cosine, distance);
				expect(score).toBeGreaterThanOrEqual(0);
				expect(score).toBeLessThanOrEqual(1);
			}
		}
	});
});

describe('compareVectors', () => {
	it('reports a perfect self-comparison', () => {
		const result = compareVectors([1, 2, 3], [1, 2, 3]);
		expect(result.cosineSimilarity).toBeCloseTo(1, 12);
		expect(result.euclideanDistance).toBe(0);
		expect(result.normalizedScore).toBeCloseTo(1, 12);
	});
});

describe('alignKeyed', () => {
	it('intersects on shared keys, preserving the first vector order', () => {
		const [a, b] = alignKeyed(['x', 'y', 'z'], [1, 2, 3], ['z', 'x'], [30, 10]);
		expect(a).toEqual([1, 3]);
		expect(b).toEqual([10, 30]);
	});

	it('throws when no keys are shared', () => {
		expect(() => alignKeyed(['x'], [1], ['y'], [2])).toThrow(/no common feature keys/);
	});
});

describe('compareFingerprints', () => {
	const base = fingerprintFromSignal(sine(440));

	it('scores an identical fingerprint at 1', () => {
		const result = compareFingerprints(base, base);
		expect(result.cosineSimilarity).toBeCloseTo(1, 12);
		expect(result.euclideanDistance).toBeCloseTo(0, 12);
		expect(result.normalizedScore).toBeCloseTo(1, 12);
	});

	it('scores a nearly identical signal higher than a very different one', () => {
		const nearlyIdentical = fingerprintFromSignal(sine(440.0001));
		const different = fingerprintFromSignal(sine(9000, 0.05));

		const near = compareFingerprints(base, nearlyIdentical);
		const far = compareFingerprints(base, different);

		expect(near.normalizedScore).toBeGreaterThan(far.normalizedScore);
		expect(near.euclideanDistance).toBeLessThan(far.euclideanDistance);
	});

	it('is symmetric', () => {
		const other = fingerprintFromSignal(sine(880));
		const ab = compareFingerprints(base, other);
		const ba = compareFingerprints(other, base);
		expect(ab.cosineSimilarity).toBeCloseTo(ba.cosineSimilarity, 12);
		expect(ab.euclideanDistance).toBeCloseTo(ba.euclideanDistance, 12);
	});

	it('refuses to compare across fingerprint versions', () => {
		const foreign = { ...base, version: 'audio-fingerprint-v99' } as unknown as AudioFingerprint;
		expect(() => compareFingerprints(base, foreign)).toThrow(/different versions/);
		expect(base.version).toBe(FINGERPRINT_VERSION);
	});
});
