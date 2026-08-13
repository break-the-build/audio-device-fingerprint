import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildExportBundle, csvEscape, toCsv, toJson } from '../src/lib/export';
import {
	STORAGE_KEY,
	addSample,
	deleteAllSamples,
	isValidSample,
	loadSamples,
	mergeSamples,
	parseSampleFile,
	removeSample,
	saveSamples,
	setDeviceGroup
} from '../src/lib/storage';
import { FINGERPRINT_VERSION } from '../src/lib/types';
import { TEST_ENVIRONMENT, fingerprintFromSignal, makeSample, sine } from './fixtures';

/** Minimal in-memory localStorage, so persistence can be tested in Node. */
class MemoryStorage implements Storage {
	private map = new Map<string, string>();
	get length(): number {
		return this.map.size;
	}
	clear(): void {
		this.map.clear();
	}
	getItem(key: string): string | null {
		return this.map.get(key) ?? null;
	}
	key(index: number): string | null {
		return [...this.map.keys()][index] ?? null;
	}
	removeItem(key: string): void {
		this.map.delete(key);
	}
	setItem(key: string, value: string): void {
		this.map.set(key, value);
	}
}

beforeEach(() => {
	(globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage();
});

afterEach(() => {
	delete (globalThis as { localStorage?: Storage }).localStorage;
});

const fingerprint = fingerprintFromSignal(sine(440));

describe('sample validation', () => {
	it('accepts a well-formed sample', () => {
		expect(isValidSample(makeSample('a', 'Laptop', fingerprint))).toBe(true);
	});

	it('rejects non-objects', () => {
		expect(isValidSample(null)).toBe(false);
		expect(isValidSample('a string')).toBe(false);
		expect(isValidSample(42)).toBe(false);
	});

	it('rejects a fingerprint from a different version', () => {
		const sample = makeSample('a', 'Laptop', {
			...fingerprint,
			version: 'audio-fingerprint-v0'
		} as never);
		expect(isValidSample(sample)).toBe(false);
	});

	it('rejects a fingerprint whose keys and features disagree in length', () => {
		const sample = makeSample('a', 'Laptop', { ...fingerprint, features: [1, 2] });
		expect(isValidSample(sample)).toBe(false);
	});

	it('rejects a sample missing required fields', () => {
		const { label: _label, ...rest } = makeSample('a', 'Laptop', fingerprint);
		expect(isValidSample(rest)).toBe(false);
	});
});

describe('round trip through storage', () => {
	it('saves and reloads samples unchanged', () => {
		const samples = [
			makeSample('a', 'Laptop', fingerprint),
			makeSample('b', 'Phone', fingerprint)
		];
		saveSamples(samples);
		const loaded = loadSamples();
		expect(loaded.dropped).toBe(0);
		expect(loaded.samples).toEqual(samples);
	});

	it('preserves the exact feature vector across serialization', () => {
		saveSamples([makeSample('a', 'Laptop', fingerprint)]);
		const restored = loadSamples().samples[0];
		expect(restored.fingerprint.features).toEqual([...fingerprint.features]);
		expect(restored.fingerprint.version).toBe(FINGERPRINT_VERSION);
	});

	it('returns nothing when storage is empty', () => {
		expect(loadSamples()).toEqual({ samples: [], dropped: 0 });
	});

	it('drops malformed entries instead of throwing, and counts them', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify([makeSample('a', 'Laptop', fingerprint), { bogus: true }, null])
		);
		const loaded = loadSamples();
		expect(loaded.samples).toHaveLength(1);
		expect(loaded.dropped).toBe(2);
	});

	it('survives invalid JSON', () => {
		localStorage.setItem(STORAGE_KEY, 'not json at all');
		expect(loadSamples().samples).toEqual([]);
	});
});

describe('sample mutations return new arrays', () => {
	it('adds without mutating the input', () => {
		const before: never[] = [];
		const after = addSample(before, {
			label: 'MacBook Chrome',
			deviceGroup: 'Laptop A',
			fingerprint,
			environment: TEST_ENVIRONMENT
		});
		expect(before).toHaveLength(0);
		expect(after).toHaveLength(1);
		expect(after[0].label).toBe('MacBook Chrome');
		expect(after[0].browser).toBe(TEST_ENVIRONMENT.browser);
		expect(after[0].id).toBeTruthy();
		// The timestamp lives on the sample, never inside the fingerprint.
		expect(Object.keys(after[0].fingerprint)).not.toContain('createdAt');
	});

	it('gives each added sample a distinct id', () => {
		const fields = {
			label: 'x',
			deviceGroup: 'g',
			fingerprint,
			environment: TEST_ENVIRONMENT
		};
		const two = addSample(addSample([], fields), fields);
		expect(two[0].id).not.toBe(two[1].id);
	});

	it('removes by id without mutating the input', () => {
		const before = [makeSample('a', 'Laptop', fingerprint), makeSample('b', 'Phone', fingerprint)];
		const after = removeSample(before, 'a');
		expect(before).toHaveLength(2);
		expect(after.map((s) => s.id)).toEqual(['b']);
	});

	it('reassigns a device group without mutating the input', () => {
		const before = [makeSample('a', 'Laptop', fingerprint)];
		const after = setDeviceGroup(before, 'a', 'Phone B');
		expect(before[0].deviceGroup).toBe('Laptop');
		expect(after[0].deviceGroup).toBe('Phone B');
	});

	it('deletes everything', () => {
		saveSamples([makeSample('a', 'Laptop', fingerprint)]);
		deleteAllSamples();
		expect(loadSamples().samples).toEqual([]);
	});
});

describe('importing samples from another browser', () => {
	const local = [makeSample('local-1', 'Laptop A', fingerprint)];
	const foreign = [
		makeSample('foreign-1', 'Laptop A', fingerprint),
		makeSample('foreign-2', 'Phone B', fingerprint)
	];

	it('parses a full export bundle', () => {
		const parsed = parseSampleFile(toJson(foreign));
		expect(parsed.samples.map((s) => s.id)).toEqual(['foreign-1', 'foreign-2']);
		expect(parsed.invalid).toBe(0);
	});

	it('parses a bare array of samples', () => {
		expect(parseSampleFile(JSON.stringify(foreign)).samples).toHaveLength(2);
	});

	it('counts unusable entries instead of failing the whole import', () => {
		const parsed = parseSampleFile(JSON.stringify([foreign[0], { nope: true }]));
		expect(parsed.samples).toHaveLength(1);
		expect(parsed.invalid).toBe(1);
	});

	it('rejects invalid JSON with a readable message', () => {
		expect(() => parseSampleFile('{oops')).toThrow(/not valid JSON/);
	});

	it('rejects JSON that is not a sample file', () => {
		expect(() => parseSampleFile('{"unrelated": 1}')).toThrow(/samples/);
	});

	it('merges foreign samples alongside local ones', () => {
		const result = mergeSamples(local, foreign);
		expect(result.added).toBe(2);
		expect(result.duplicates).toBe(0);
		expect(result.samples.map((s) => s.id)).toEqual(['local-1', 'foreign-1', 'foreign-2']);
	});

	it('does not mutate the existing array', () => {
		mergeSamples(local, foreign);
		expect(local).toHaveLength(1);
	});

	it('is idempotent: re-importing the same file adds nothing', () => {
		const once = mergeSamples(local, foreign);
		const twice = mergeSamples(once.samples, foreign);
		expect(twice.added).toBe(0);
		expect(twice.duplicates).toBe(2);
		expect(twice.samples).toHaveLength(3);
	});

	it('persists the merged set so it survives a reload', () => {
		mergeSamples(local, foreign);
		expect(loadSamples().samples.map((s) => s.id)).toEqual([
			'local-1',
			'foreign-1',
			'foreign-2'
		]);
	});

	it('round trips an export through an import unchanged', () => {
		const restored = parseSampleFile(toJson(foreign)).samples;
		expect(restored[0].fingerprint.features).toEqual([...fingerprint.features]);
		expect(restored).toEqual(foreign);
	});
});

describe('export', () => {
	const samples = [
		makeSample('a', 'Laptop A', fingerprint),
		makeSample('b', 'Laptop A', fingerprint),
		makeSample('c', 'Phone B', fingerprintFromSignal(sine(3000, 0.2)))
	];

	it('bundles samples, groups and both analyses', () => {
		const bundle = buildExportBundle(samples);
		expect(bundle.sampleCount).toBe(3);
		expect(bundle.deviceGroups).toEqual(['Laptop A', 'Phone B']);
		expect(bundle.analyses.map((a) => a.mode)).toEqual(['audio', 'audio+environment']);
		expect(bundle.disclaimer).toMatch(/not guaranteed unique hardware identifiers/);
	});

	it('omits analyses rather than inventing them for a single sample', () => {
		expect(buildExportBundle([samples[0]]).analyses).toEqual([]);
	});

	it('produces parseable JSON that round trips', () => {
		const parsed = JSON.parse(toJson(samples));
		expect(parsed.samples).toHaveLength(3);
		expect(parsed.fingerprintVersion).toBe(FINGERPRINT_VERSION);
	});

	it('produces one CSV row per pair per mode', () => {
		const lines = toCsv(samples).trim().split('\n');
		// 3 samples -> 3 pairs, times 2 modes, plus the header.
		expect(lines).toHaveLength(1 + 3 * 2);
		expect(lines[0]).toMatch(/^mode,a_id/);
	});

	it('emits a header-only CSV when there is nothing to compare', () => {
		expect(toCsv([samples[0]]).trim().split('\n')).toHaveLength(1);
	});

	it('escapes quotes, commas and newlines', () => {
		expect(csvEscape('plain')).toBe('plain');
		expect(csvEscape('a,b')).toBe('"a,b"');
		expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
		expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
	});

	it('writes the CSV label of a sample containing a comma safely', () => {
		const tricky = [
			makeSample('x', 'Group, with comma', fingerprint),
			makeSample('y', 'Group, with comma', fingerprint)
		];
		expect(toCsv(tricky)).toContain('"Group, with comma"');
	});
});
