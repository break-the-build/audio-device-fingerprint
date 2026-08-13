/**
 * Shared reactive state.
 *
 * Kept in one place so every panel reads the same sample list, comparison
 * mode and experimental threshold. The threshold is deliberately a user
 * setting with no default claim attached to it: the app does not know what
 * score "means" the same device, and neither does anyone else until the data
 * has been collected.
 */

import * as storage from './storage';
import type { AudioFingerprint, ComparisonMode, EnvironmentInfo, Sample } from './types';

/** Starting point for the threshold slider. Arbitrary, and labelled as such. */
export const DEFAULT_THRESHOLD = 0.9;

class ExperimentState {
	samples = $state<Sample[]>([]);
	mode = $state<ComparisonMode>('audio');
	threshold = $state(DEFAULT_THRESHOLD);
	/** Entries found in storage that could not be parsed as samples. */
	droppedOnLoad = $state(0);
	storageAvailable = $state(true);

	/** Read persisted samples. Call once, from the browser. */
	hydrate(): void {
		this.storageAvailable = storage.isStorageAvailable();
		const { samples, dropped } = storage.loadSamples();
		this.samples = samples;
		this.droppedOnLoad = dropped;
	}

	add(fields: {
		label: string;
		deviceGroup: string;
		fingerprint: AudioFingerprint;
		environment: EnvironmentInfo;
	}): void {
		this.samples = storage.addSample(this.samples, fields);
	}

	/** Merge samples exported from another browser. Never mutates in place. */
	importFile(text: string): storage.MergeResult & { invalid: number } {
		const { samples: incoming, invalid } = storage.parseSampleFile(text);
		const result = storage.mergeSamples(this.samples, incoming);
		this.samples = result.samples;
		return { ...result, invalid };
	}

	remove(id: string): void {
		this.samples = storage.removeSample(this.samples, id);
	}

	setGroup(id: string, deviceGroup: string): void {
		this.samples = storage.setDeviceGroup(this.samples, id, deviceGroup);
	}

	deleteAll(): void {
		storage.deleteAllSamples();
		this.samples = [];
		this.droppedOnLoad = 0;
	}

	/** Distinct device groups currently in use, for the datalist. */
	get deviceGroups(): string[] {
		return [...new Set(this.samples.map((s) => s.deviceGroup))].sort();
	}
}

export const experiment = new ExperimentState();
