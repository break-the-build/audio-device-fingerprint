/**
 * Export of measured data.
 *
 * The JSON export is the full record: samples, fingerprints, environment and
 * every computed comparison. The CSV export is one row per pairwise
 * comparison, which is the shape you want for a pivot table or a pandas
 * DataFrame.
 */

import { analyzeExperiment } from './analysis';
import { FINGERPRINT_VERSION } from './types';
import type { ComparisonMode, ExperimentAnalysis, Sample } from './types';

export const EXPORT_FORMAT_VERSION = 'audio-device-experiment-export-v1';

export interface ExportBundle {
	readonly format: typeof EXPORT_FORMAT_VERSION;
	readonly fingerprintVersion: typeof FINGERPRINT_VERSION;
	/** When the export was produced. Export metadata only -- never part of a fingerprint. */
	readonly exportedAt: string;
	readonly sampleCount: number;
	readonly deviceGroups: readonly string[];
	readonly samples: readonly Sample[];
	readonly analyses: readonly ExperimentAnalysis[];
	readonly disclaimer: string;
}

export const DISCLAIMER =
	'Audio fingerprints are probabilistic measurements of browser audio-processing behavior. They are not guaranteed unique hardware identifiers.';

const MODES: readonly ComparisonMode[] = ['audio', 'audio+environment'];

export function buildExportBundle(samples: readonly Sample[]): ExportBundle {
	const groups = [...new Set(samples.map((s) => s.deviceGroup))].sort();
	return {
		format: EXPORT_FORMAT_VERSION,
		fingerprintVersion: FINGERPRINT_VERSION,
		exportedAt: new Date().toISOString(),
		sampleCount: samples.length,
		deviceGroups: groups,
		samples,
		// Comparisons need at least two samples to exist at all.
		analyses: samples.length >= 2 ? MODES.map((mode) => analyzeExperiment(samples, mode)) : [],
		disclaimer: DISCLAIMER
	};
}

export function toJson(samples: readonly Sample[]): string {
	return JSON.stringify(buildExportBundle(samples), null, 2);
}

/** Quote a CSV field, doubling any embedded quotes. */
export function csvEscape(value: string | number): string {
	const text = String(value);
	return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One row per pairwise comparison per mode. Empty (header only) when fewer
 * than two samples exist -- no rows are invented to fill it.
 */
export function toCsv(samples: readonly Sample[]): string {
	const header = [
		'mode',
		'a_id',
		'a_label',
		'a_group',
		'a_browser',
		'b_id',
		'b_label',
		'b_group',
		'b_browser',
		'same_device_group',
		'cosine_similarity',
		'euclidean_distance',
		'normalized_score'
	];
	const byId = new Map(samples.map((s) => [s.id, s]));
	const rows: string[][] = [];

	if (samples.length >= 2) {
		for (const mode of MODES) {
			for (const pair of analyzeExperiment(samples, mode).pairs) {
				rows.push([
					mode,
					pair.aId,
					pair.aLabel,
					pair.aGroup,
					byId.get(pair.aId)?.browser ?? '',
					pair.bId,
					pair.bLabel,
					pair.bGroup,
					byId.get(pair.bId)?.browser ?? '',
					String(pair.sameGroup),
					pair.result.cosineSimilarity.toFixed(9),
					pair.result.euclideanDistance.toFixed(9),
					pair.result.normalizedScore.toFixed(9)
				]);
			}
		}
	}

	return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

/** Trigger a client-side file download. Browser-only. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	URL.revokeObjectURL(url);
}
