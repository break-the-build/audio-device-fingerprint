/**
 * Shared type definitions for the audio device fingerprint experiment.
 *
 * Terminology used throughout this project is deliberately conservative:
 *  - "experimental fingerprint" -- a measurement, not an identifier
 *  - "similarity score"         -- a distance metric, not a match verdict
 *  - "same-device hypothesis"   -- the claim under test, not an assumption
 */

export const FINGERPRINT_VERSION = 'audio-fingerprint-v1' as const;

/** Identifiers for the deterministic audio test signals. */
export type TestId =
	| 'sine'
	| 'triangle'
	| 'square'
	| 'multi-frequency'
	| 'impulse'
	| 'compressor-response';

/** One named scalar feature extracted from a rendered buffer. */
export interface Feature {
	/** Stable key, e.g. "sine.rms". Used for alignment between fingerprints. */
	readonly key: string;
	/** Raw, un-normalized measured value. */
	readonly value: number;
}

/** The features produced by a single audio test. */
export interface TestResult {
	readonly testId: TestId;
	readonly features: readonly Feature[];
}

/**
 * A complete audio fingerprint.
 *
 * Contains no timestamps, no random values and no counters -- only values
 * derived deterministically from rendered audio. This is what gets compared.
 */
export interface AudioFingerprint {
	readonly version: typeof FINGERPRINT_VERSION;
	readonly sampleRate: number;
	/** Ordered feature keys, parallel to `features`. */
	readonly keys: readonly string[];
	/** Normalized feature vector, parallel to `keys`. */
	readonly features: readonly number[];
	/** Raw values before normalization, kept for inspection and re-analysis. */
	readonly raw: readonly TestResult[];
}

/** Conventional browser/environment signals, kept strictly out of the audio vector. */
export interface EnvironmentInfo {
	readonly userAgent: string;
	readonly platform: string;
	readonly language: string;
	readonly screenWidth: number;
	readonly screenHeight: number;
	readonly devicePixelRatio: number;
	readonly hardwareConcurrency: number | null;
	readonly deviceMemory: number | null;
	readonly timezone: string;
	readonly webglVendor: string | null;
	readonly webglRenderer: string | null;
	readonly webglVersion: string | null;
	/** Browser family guessed from the UA string; used only as a display label. */
	readonly browser: string;
}

/** A saved measurement: one fingerprint plus its context. */
export interface Sample {
	readonly id: string;
	readonly label: string;
	/** User-assigned physical device group, e.g. "Laptop A". */
	readonly deviceGroup: string;
	readonly browser: string;
	/** ISO timestamp. Recorded on the sample, never inside the fingerprint. */
	readonly createdAt: string;
	readonly fingerprint: AudioFingerprint;
	readonly environment: EnvironmentInfo;
}

export interface ComparisonResult {
	readonly cosineSimilarity: number;
	readonly euclideanDistance: number;
	readonly normalizedScore: number;
}

/** Which vector is fed into the comparison. */
export type ComparisonMode = 'audio' | 'audio+environment';

export interface DescriptiveStats {
	readonly count: number;
	readonly mean: number;
	readonly median: number;
	readonly stdDev: number;
	readonly min: number;
	readonly max: number;
}

/** One entry of a pairwise comparison list. */
export interface PairComparison {
	readonly aId: string;
	readonly bId: string;
	readonly aLabel: string;
	readonly bLabel: string;
	readonly aGroup: string;
	readonly bGroup: string;
	readonly sameGroup: boolean;
	readonly result: ComparisonResult;
}

export interface RepeatabilityReport {
	readonly runs: number;
	readonly mode: ComparisonMode;
	readonly cosine: DescriptiveStats;
	readonly euclidean: DescriptiveStats;
	readonly normalized: DescriptiveStats;
	/** Every pairwise score, so the raw data is inspectable. */
	readonly pairs: readonly ComparisonResult[];
}

export interface SeparationReport {
	/** Comparisons between samples sharing a device group. */
	readonly within: DescriptiveStats;
	/** Comparisons across different device groups. */
	readonly between: DescriptiveStats;
	/**
	 * mean(within) - mean(between) on the normalized score.
	 * Positive values are the direction the hypothesis predicts.
	 */
	readonly meanGap: number;
	/**
	 * Standardized separation ("Cohen's d"-style) using pooled standard
	 * deviation. NaN when either distribution has fewer than 2 samples.
	 */
	readonly effectSize: number;
	/**
	 * Gap between the lowest within-device score and the highest
	 * between-device score. Positive means the two distributions do not
	 * overlap at all in the collected data.
	 */
	readonly overlapMargin: number;
	/** Best achievable accuracy over any threshold, plus that threshold. */
	readonly bestThreshold: number;
	readonly bestAccuracy: number;
	readonly verdict: HypothesisVerdict;
	readonly notes: readonly string[];
}

export type HypothesisVerdict =
	| 'insufficient-data'
	| 'supported'
	| 'weakly-supported'
	| 'not-supported';

export interface ExperimentAnalysis {
	readonly mode: ComparisonMode;
	readonly pairs: readonly PairComparison[];
	readonly separation: SeparationReport;
}
