/**
 * Vector similarity metrics.
 *
 * These are pure functions over number arrays so they can be unit tested with
 * deterministic fixtures, without a browser or an audio device.
 */

import type { AudioFingerprint, ComparisonResult } from './types';

export class VectorLengthError extends Error {
	constructor(a: number, b: number) {
		super(`Vector length mismatch: ${a} vs ${b}`);
		this.name = 'VectorLengthError';
	}
}

function assertSameLength(a: readonly number[], b: readonly number[]): void {
	if (a.length !== b.length) throw new VectorLengthError(a.length, b.length);
	if (a.length === 0) throw new Error('Cannot compare empty vectors');
}

export function dot(a: readonly number[], b: readonly number[]): number {
	assertSameLength(a, b);
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
	return sum;
}

export function magnitude(a: readonly number[]): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
	return Math.sqrt(sum);
}

/**
 * Cosine similarity in [-1, 1].
 *
 * Returns 0 when either vector is the zero vector -- the angle is undefined
 * there, and 0 ("orthogonal / no evidence") is the conservative answer.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
	assertSameLength(a, b);
	const magA = magnitude(a);
	const magB = magnitude(b);
	if (magA === 0 || magB === 0) return 0;
	return clamp(dot(a, b) / (magA * magB), -1, 1);
}

/** Standard L2 distance. 0 means identical vectors. */
export function euclideanDistance(a: readonly number[], b: readonly number[]): number {
	assertSameLength(a, b);
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

/**
 * Euclidean distance divided by sqrt(dimension), so vectors of different
 * dimensionality produce comparable magnitudes.
 */
export function normalizedEuclideanDistance(
	a: readonly number[],
	b: readonly number[]
): number {
	return euclideanDistance(a, b) / Math.sqrt(a.length);
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * A single convenience score in [0, 1] combining both metrics.
 *
 * This is a presentation aid, NOT a verdict. It carries no built-in claim
 * that any particular value means "same device" -- thresholds are supplied by
 * the operator in the UI and evaluated against measured data.
 *
 * Definition: the mean of
 *   - cosine similarity mapped from [-1, 1] to [0, 1]
 *   - a distance term 1 / (1 + normalizedEuclideanDistance)
 */
export function combineScores(cosine: number, normalizedDistance: number): number {
	const cosineTerm = (cosine + 1) / 2;
	const distanceTerm = 1 / (1 + normalizedDistance);
	return clamp((cosineTerm + distanceTerm) / 2, 0, 1);
}

/** Compare two raw numeric vectors. */
export function compareVectors(
	a: readonly number[],
	b: readonly number[]
): ComparisonResult {
	const cosine = cosineSimilarity(a, b);
	const distance = euclideanDistance(a, b);
	const normalizedDistance = distance / Math.sqrt(a.length);
	return {
		cosineSimilarity: cosine,
		euclideanDistance: distance,
		normalizedScore: combineScores(cosine, normalizedDistance)
	};
}

/**
 * Compare two fingerprints.
 *
 * Feature keys are aligned by name before comparison, so fingerprints that
 * were produced with a different feature ordering (or where one browser
 * omitted a test) are still compared on their shared dimensions. If the
 * versions differ, comparison is refused rather than silently misaligned.
 */
export function compareFingerprints(
	a: AudioFingerprint,
	b: AudioFingerprint
): ComparisonResult {
	if (a.version !== b.version) {
		throw new Error(
			`Cannot compare fingerprints of different versions: ${a.version} vs ${b.version}`
		);
	}
	const [va, vb] = alignVectors(a, b);
	return compareVectors(va, vb);
}

/** Intersect the two key sets (in `a`'s order) and return the parallel vectors. */
export function alignVectors(
	a: AudioFingerprint,
	b: AudioFingerprint
): [number[], number[]] {
	return alignKeyed(a.keys, a.features, b.keys, b.features);
}

/**
 * Align two named vectors on their shared keys, preserving `aKeys` order.
 *
 * Alignment by name rather than by position means a sample recorded before a
 * test was added can still be compared on the dimensions both samples have.
 */
export function alignKeyed(
	aKeys: readonly string[],
	aValues: readonly number[],
	bKeys: readonly string[],
	bValues: readonly number[]
): [number[], number[]] {
	const bIndex = new Map<string, number>();
	bKeys.forEach((key, i) => bIndex.set(key, i));

	const va: number[] = [];
	const vb: number[] = [];
	aKeys.forEach((key, i) => {
		const j = bIndex.get(key);
		if (j === undefined) return;
		va.push(aValues[i]);
		vb.push(bValues[j]);
	});

	if (va.length === 0) {
		throw new Error('Vectors share no common feature keys');
	}
	return [va, vb];
}
