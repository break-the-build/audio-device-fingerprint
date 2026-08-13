/**
 * Local persistence.
 *
 * Samples live in localStorage and nowhere else. Nothing is transmitted: the
 * app has no analytics, no third-party scripts, and its only server route is
 * one that deliberately does not store anything.
 */

import type { AudioFingerprint, EnvironmentInfo, Sample } from './types';
import { FINGERPRINT_VERSION } from './types';

export const STORAGE_KEY = 'audio-device-fingerprint.samples.v1';

export class StorageUnavailableError extends Error {
	constructor() {
		super('localStorage is not available, so samples cannot be saved in this browser.');
		this.name = 'StorageUnavailableError';
	}
}

function getStorage(): Storage {
	if (typeof localStorage === 'undefined') throw new StorageUnavailableError();
	return localStorage;
}

/** True when samples can be persisted here (private modes may block writes). */
export function isStorageAvailable(): boolean {
	try {
		const probe = `${STORAGE_KEY}.probe`;
		getStorage().setItem(probe, '1');
		getStorage().removeItem(probe);
		return true;
	} catch {
		return false;
	}
}

/** Generate a unique sample id, preferring the platform UUID generator. */
export function newId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Validate a parsed object well enough to trust it as a Sample. */
export function isValidSample(value: unknown): value is Sample {
	if (typeof value !== 'object' || value === null) return false;
	const s = value as Partial<Sample>;
	const fp = s.fingerprint as Partial<AudioFingerprint> | undefined;
	return (
		typeof s.id === 'string' &&
		typeof s.label === 'string' &&
		typeof s.deviceGroup === 'string' &&
		typeof s.browser === 'string' &&
		typeof s.createdAt === 'string' &&
		typeof s.environment === 'object' &&
		s.environment !== null &&
		!!fp &&
		fp.version === FINGERPRINT_VERSION &&
		typeof fp.sampleRate === 'number' &&
		Array.isArray(fp.keys) &&
		Array.isArray(fp.features) &&
		fp.keys.length === fp.features.length
	);
}

/**
 * Read all saved samples. Malformed or foreign entries are dropped rather
 * than crashing the app; the count of dropped entries is returned so the UI
 * can say something honest about it.
 */
export function loadSamples(): { samples: Sample[]; dropped: number } {
	let text: string | null = null;
	try {
		text = getStorage().getItem(STORAGE_KEY);
	} catch {
		return { samples: [], dropped: 0 };
	}
	if (!text) return { samples: [], dropped: 0 };

	try {
		const parsed: unknown = JSON.parse(text);
		if (!Array.isArray(parsed)) return { samples: [], dropped: 0 };
		const samples = parsed.filter(isValidSample);
		return { samples, dropped: parsed.length - samples.length };
	} catch {
		return { samples: [], dropped: 0 };
	}
}

/** Overwrite the stored sample list. */
export function saveSamples(samples: readonly Sample[]): void {
	getStorage().setItem(STORAGE_KEY, JSON.stringify(samples));
}

export interface ParsedImport {
	readonly samples: readonly Sample[];
	/** Entries present in the file that were not usable samples. */
	readonly invalid: number;
}

/**
 * Parse an exported file into samples.
 *
 * localStorage is scoped per browser profile, so samples collected in Arc,
 * Chrome, Firefox and Safari each live in their own silo. Exporting from each
 * browser and importing them into one is how the experiment gets assembled --
 * without any of them being sent anywhere.
 *
 * Accepts either a full export bundle ({ samples: [...] }) or a bare array,
 * so a hand-merged file works too.
 */
export function parseSampleFile(text: string): ParsedImport {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('That file is not valid JSON.');
	}

	const list =
		Array.isArray(parsed) ? parsed
		: typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { samples?: unknown }).samples)
			? ((parsed as { samples: unknown[] }).samples)
			: null;

	if (list === null) {
		throw new Error(
			'Expected an exported JSON file containing a "samples" array, or a bare array of samples.'
		);
	}

	const samples = list.filter(isValidSample);
	return { samples, invalid: list.length - samples.length };
}

export interface MergeResult {
	readonly samples: Sample[];
	readonly added: number;
	/** Skipped because a sample with that id was already present. */
	readonly duplicates: number;
}

/**
 * Merge imported samples into the existing set, keyed by id.
 *
 * Re-importing the same file is a no-op rather than a way to duplicate
 * measurements -- duplicated samples would silently inflate whichever
 * distribution they land in and distort the analysis.
 */
export function mergeSamples(
	existing: readonly Sample[],
	incoming: readonly Sample[]
): MergeResult {
	const known = new Set(existing.map((s) => s.id));
	const fresh: Sample[] = [];
	let duplicates = 0;

	for (const sample of incoming) {
		if (known.has(sample.id)) {
			duplicates++;
			continue;
		}
		known.add(sample.id);
		fresh.push(sample);
	}

	const samples = [...existing, ...fresh];
	saveSamples(samples);
	return { samples, added: fresh.length, duplicates };
}

/**
 * Append a sample, returning a NEW array. The caller owns the resulting
 * state; this never mutates the array it is given.
 */
export function addSample(
	samples: readonly Sample[],
	fields: {
		label: string;
		deviceGroup: string;
		fingerprint: AudioFingerprint;
		environment: EnvironmentInfo;
	}
): Sample[] {
	const sample: Sample = {
		id: newId(),
		label: fields.label,
		deviceGroup: fields.deviceGroup,
		browser: fields.environment.browser,
		createdAt: new Date().toISOString(),
		fingerprint: fields.fingerprint,
		environment: fields.environment
	};
	const next = [...samples, sample];
	saveSamples(next);
	return next;
}

/** Remove one sample by id, returning a new array. */
export function removeSample(samples: readonly Sample[], id: string): Sample[] {
	const next = samples.filter((s) => s.id !== id);
	saveSamples(next);
	return next;
}

/** Change a sample's device group, returning a new array. */
export function setDeviceGroup(
	samples: readonly Sample[],
	id: string,
	deviceGroup: string
): Sample[] {
	const next = samples.map((s) => (s.id === id ? { ...s, deviceGroup } : s));
	saveSamples(next);
	return next;
}

/** Delete everything this app has stored. */
export function deleteAllSamples(): void {
	try {
		getStorage().removeItem(STORAGE_KEY);
	} catch {
		// Nothing was stored, so there is nothing to delete.
	}
}
