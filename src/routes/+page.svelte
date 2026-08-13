<script lang="ts">
	import { onMount } from 'svelte';

	import { isAudioFingerprintingSupported } from '$lib/audioFingerprint';
	import AnalysisPanel from '$lib/components/AnalysisPanel.svelte';
	import ExportPanel from '$lib/components/ExportPanel.svelte';
	import GeneratePanel from '$lib/components/GeneratePanel.svelte';
	import MatrixTable from '$lib/components/MatrixTable.svelte';
	import RepeatabilityPanel from '$lib/components/RepeatabilityPanel.svelte';
	import SamplesPanel from '$lib/components/SamplesPanel.svelte';
	import Section from '$lib/components/Section.svelte';
	import { collectEnvironment } from '$lib/environment';
	import { DISCLAIMER } from '$lib/export';
	import { experiment } from '$lib/state.svelte';
	import type { EnvironmentInfo } from '$lib/types';

	let ready = $state(false);
	let audioSupported = $state(false);
	let environment = $state<EnvironmentInfo | null>(null);
	let environmentError = $state<string | null>(null);

	onMount(() => {
		experiment.hydrate();
		audioSupported = isAudioFingerprintingSupported();
		try {
			environment = collectEnvironment();
		} catch (cause) {
			environmentError = cause instanceof Error ? cause.message : String(cause);
		}
		ready = true;
	});

	function confirmDeleteAll(): void {
		if (experiment.samples.length === 0) return;
		if (confirm(`Delete all ${experiment.samples.length} saved samples? This cannot be undone.`)) {
			experiment.deleteAll();
		}
	}

	const NAV = [
		['overview', 'Overview'],
		['generate', 'Generate'],
		['samples', 'Saved Samples'],
		['compare', 'Compare'],
		['repeatability', 'Repeatability'],
		['analysis', 'Analysis'],
		['export', 'Export']
	] as const;
</script>

<div class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<header class="mb-6">
		<h1 class="text-2xl font-bold tracking-tight text-ink-100">
			Audio Device Fingerprint Experiment
		</h1>
		<p class="mt-1 text-sm text-ink-400">
			A local instrument for testing the same-device hypothesis: that one physical machine
			produces similar Web Audio feature vectors across different browsers, and a different
			machine produces dissimilar ones.
		</p>
	</header>

	<nav class="mb-6 flex flex-wrap gap-2 text-sm">
		{#each NAV as [id, title] (id)}
			<a
				href="#{id}"
				class="rounded border border-ink-800 px-3 py-1 text-ink-300 transition hover:border-accent hover:text-ink-100"
			>
				{title}
			</a>
		{/each}
	</nav>

	<p class="mb-6 rounded border border-caution/40 bg-caution/5 p-3 text-sm text-caution">
		{DISCLAIMER}
	</p>

	<div class="space-y-6">
		<Section
			id="overview"
			index={1}
			title="Overview"
			subtitle="What this measures, and what it deliberately does not do."
		>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-3 text-sm text-ink-300">
					<p>
						Each fingerprint is produced by synthesising six deterministic signals inside an
						<code class="text-accent">OfflineAudioContext</code>, rendering them through
						oscillators, gain stages, biquad filters, a dynamics compressor and an analyser, and
						then extracting scalar features from the resulting buffers.
					</p>
					<p>
						The features are combined into a single normalized vector and compared using cosine
						similarity and Euclidean distance. The buffer is never hashed: a one-bit difference
						would change a hash completely, which makes the question "how similar are these?"
						unanswerable.
					</p>
					<p>
						The hypothesis is being tested here, not assumed. Every number on this page comes
						from measurements you took on this machine. Nothing is seeded, simulated or filled
						in.
					</p>
				</div>

				<div class="space-y-3">
					<div class="rounded border border-ink-800 bg-ink-850 p-3 text-sm">
						<h3 class="mb-2 text-xs font-semibold tracking-wide text-ink-300 uppercase">
							Privacy
						</h3>
						<ul class="space-y-1 text-ink-300">
							<li>✓ No microphone access — audio is synthesised, never recorded</li>
							<li>✓ No camera, contacts or geolocation</li>
							<li>✓ No network transmission of fingerprints; no third parties</li>
							<li>✓ Samples are stored in this browser's localStorage only</li>
						</ul>
						<button
							type="button"
							onclick={confirmDeleteAll}
							disabled={experiment.samples.length === 0}
							class="mt-3 rounded border border-alert/60 px-3 py-1.5 text-xs font-semibold text-alert transition hover:bg-alert/10 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Delete All Samples
						</button>
					</div>

					{#if ready}
						<div class="rounded border border-ink-800 bg-ink-850 p-3 text-sm">
							<h3 class="mb-2 text-xs font-semibold tracking-wide text-ink-300 uppercase">
								This environment
							</h3>
							<ul class="space-y-1">
								<li class:text-alert={!audioSupported} class:text-signal={audioSupported}>
									{audioSupported
										? 'OfflineAudioContext available'
										: 'OfflineAudioContext unavailable — fingerprints cannot be measured here'}
								</li>
								<li
									class:text-alert={!experiment.storageAvailable}
									class:text-signal={experiment.storageAvailable}
								>
									{experiment.storageAvailable
										? 'localStorage available'
										: 'localStorage unavailable — samples will not persist'}
								</li>
								{#if environmentError}
									<li class="text-alert">Environment metadata unavailable: {environmentError}</li>
								{:else if environment}
									<li class="text-ink-300">Detected browser: {environment.browser}</li>
								{/if}
							</ul>
						</div>
					{/if}
				</div>
			</div>
		</Section>

		<Section
			id="generate"
			index={2}
			title="Generate Fingerprint"
			subtitle="Name this browser, assign it to a physical device group, and measure."
		>
			{#if ready}
				<GeneratePanel {audioSupported} {environment} />
			{:else}
				<p class="text-sm text-ink-400">Checking browser capabilities…</p>
			{/if}
		</Section>

		<Section
			id="samples"
			index={3}
			title="Saved Samples"
			subtitle="Stored locally. Device groups can be reassigned at any time without re-measuring."
		>
			<SamplesPanel />
		</Section>

		<Section
			id="compare"
			index={4}
			title="Compare"
			subtitle="Every saved fingerprint against every other, using the mode and threshold you choose."
		>
			<div class="mb-4 grid gap-4 sm:grid-cols-2">
				<fieldset>
					<legend class="mb-1 block text-sm font-medium text-ink-300">Comparison mode</legend>
					<div class="flex gap-2">
						<label class="flex items-center gap-2 text-sm">
							<input type="radio" bind:group={experiment.mode} value="audio" /> Audio only
						</label>
						<label class="flex items-center gap-2 text-sm">
							<input type="radio" bind:group={experiment.mode} value="audio+environment" /> Audio +
							environment
						</label>
					</div>
					<p class="mt-1 text-xs text-ink-400">
						Switching modes shows how much of the separation comes from audio behaviour rather
						than from conventional browser attributes.
					</p>
				</fieldset>

				<label class="block">
					<span class="mb-1 block text-sm font-medium text-ink-300">
						Experimental threshold:
						<span class="numeric text-ink-100">{experiment.threshold.toFixed(3)}</span>
					</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.001"
						bind:value={experiment.threshold}
						class="w-full accent-[var(--color-accent)]"
					/>
					<p class="mt-1 text-xs text-ink-400">
						A display setting only. No score is claimed to mean "same device" — that is what the
						analysis below is for.
					</p>
				</label>
			</div>

			<MatrixTable
				samples={experiment.samples}
				mode={experiment.mode}
				threshold={experiment.threshold}
			/>
		</Section>

		<Section
			id="repeatability"
			index={5}
			title="Repeatability Test"
			subtitle="Measure stability on this browser first. Do not assume it."
		>
			{#if ready}
				<RepeatabilityPanel {audioSupported} />
			{:else}
				<p class="text-sm text-ink-400">Checking browser capabilities…</p>
			{/if}
		</Section>

		<Section
			id="analysis"
			index={6}
			title="Experiment Analysis"
			subtitle="Within-device versus between-device similarity, and how far apart the two distributions actually are."
		>
			<AnalysisPanel />
		</Section>

		<Section
			id="export"
			index={7}
			title="Export"
			subtitle="Take the measurements somewhere else for analysis."
		>
			<ExportPanel />
		</Section>
	</div>

	<footer class="mt-8 border-t border-ink-800 pt-4 text-xs text-ink-400">
		<p>
			Terminology used deliberately: <em>experimental fingerprint</em>, <em>similarity score</em>,
			<em>same-device hypothesis</em>, <em>probabilistic device correlation</em>. This tool does
			not identify computers.
		</p>
	</footer>
</div>
