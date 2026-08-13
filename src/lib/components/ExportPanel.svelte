<script lang="ts">
	import { downloadFile, toCsv, toJson } from '$lib/export';
	import { experiment } from '$lib/state.svelte';

	const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
	const hasData = $derived(experiment.samples.length > 0);

	function exportJson(): void {
		downloadFile(
			`audio-fingerprint-experiment-${stamp()}.json`,
			toJson(experiment.samples),
			'application/json'
		);
	}

	function exportCsv(): void {
		downloadFile(
			`audio-fingerprint-comparisons-${stamp()}.csv`,
			toCsv(experiment.samples),
			'text/csv'
		);
	}

	let importMessage = $state<string | null>(null);
	let importError = $state<string | null>(null);

	async function importJson(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		importMessage = null;
		importError = null;

		try {
			const result = experiment.importFile(await file.text());
			const parts = [`Imported ${result.added} sample${result.added === 1 ? '' : 's'}.`];
			if (result.duplicates > 0) {
				parts.push(
					`${result.duplicates} already present (matched by id) and ${
						result.duplicates === 1 ? 'was' : 'were'
					} skipped.`
				);
			}
			if (result.invalid > 0) {
				parts.push(`${result.invalid} entries could not be read as samples.`);
			}
			importMessage = parts.join(' ');
		} catch (cause) {
			importError = cause instanceof Error ? cause.message : String(cause);
		} finally {
			// Reset so re-selecting the same file fires a change event again.
			input.value = '';
		}
	}
</script>

<div class="flex flex-wrap gap-3">
	<button
		type="button"
		onclick={exportJson}
		disabled={!hasData}
		class="rounded border border-ink-700 px-4 py-2 text-sm font-semibold text-ink-100 transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
	>
		Export JSON
	</button>
	<button
		type="button"
		onclick={exportCsv}
		disabled={!hasData}
		class="rounded border border-ink-700 px-4 py-2 text-sm font-semibold text-ink-100 transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
	>
		Export CSV
	</button>
</div>

<p class="mt-3 text-sm text-ink-400">
	The JSON export contains experiment metadata, every sample with its full feature vector and raw
	feature values, environment metadata, and the computed comparisons for both modes. The CSV
	contains one row per pairwise comparison per mode — the shape you want for a pivot table or a
	pandas DataFrame. Both files are generated in your browser and saved straight to disk.
</p>

{#if !hasData}
	<p class="mt-2 text-sm text-ink-400">Nothing to export yet.</p>
{/if}

<div class="mt-5 border-t border-ink-800 pt-4">
	<h3 class="text-sm font-semibold text-ink-100">Import samples from another browser</h3>
	<p class="mt-1 mb-3 text-sm text-ink-400">
		Saved samples live in this browser's <code class="text-accent">localStorage</code>, which is
		private to each browser profile — so Chrome cannot see Arc's samples, and neither can see
		Safari's. Export JSON from each browser, then import those files here to assemble the whole
		experiment in one place. Importing merges by sample id, so the same file can be imported twice
		without duplicating measurements.
	</p>

	<label
		class="inline-block cursor-pointer rounded border border-ink-700 px-4 py-2 text-sm font-semibold text-ink-100 transition hover:border-accent"
	>
		Import JSON
		<input type="file" accept="application/json,.json" onchange={importJson} class="hidden" />
	</label>

	{#if importMessage}
		<p class="mt-3 rounded border border-signal/50 bg-signal/10 p-3 text-sm text-signal">
			{importMessage}
		</p>
	{/if}
	{#if importError}
		<p class="mt-3 rounded border border-alert/50 bg-alert/10 p-3 text-sm text-alert">
			Import failed: {importError}
		</p>
	{/if}
</div>
