<script lang="ts">
	import { generateFingerprint, type FingerprintProgress } from '$lib/audioFingerprint';
	import { AUDIO_TESTS } from '$lib/audioTests';
	import { experiment } from '$lib/state.svelte';
	import type { AudioFingerprint, EnvironmentInfo } from '$lib/types';

	interface Props {
		audioSupported: boolean;
		environment: EnvironmentInfo | null;
	}

	let { audioSupported, environment }: Props = $props();

	let label = $state('');
	let deviceGroup = $state('');
	let busy = $state(false);
	let progress = $state<FingerprintProgress | null>(null);
	let error = $state<string | null>(null);
	let lastFingerprint = $state<AudioFingerprint | null>(null);

	const canSubmit = $derived(
		audioSupported && !!environment && label.trim().length > 0 && deviceGroup.trim().length > 0
	);

	async function run(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!canSubmit || busy || !environment) return;

		busy = true;
		error = null;
		lastFingerprint = null;

		try {
			const fingerprint = await generateFingerprint((update) => {
				progress = update;
			});
			lastFingerprint = fingerprint;
			experiment.add({
				label: label.trim(),
				deviceGroup: deviceGroup.trim(),
				fingerprint,
				environment
			});
			label = '';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			busy = false;
		}
	}
</script>

{#if !audioSupported}
	<p class="mb-4 rounded border border-alert/50 bg-alert/10 p-3 text-sm text-alert">
		This browser does not expose OfflineAudioContext, so no fingerprint can be measured here.
		Everything else on this page still works with previously saved samples.
	</p>
{/if}

<form class="grid gap-4 sm:grid-cols-2" onsubmit={run}>
	<label class="block">
		<span class="mb-1 block text-sm font-medium text-ink-300">Device / Environment Name</span>
		<input
			bind:value={label}
			type="text"
			placeholder="MacBook Chrome"
			required
			disabled={busy}
			class="w-full rounded border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
		/>
	</label>

	<label class="block">
		<span class="mb-1 block text-sm font-medium text-ink-300">
			Device Group
			<span class="font-normal text-ink-400">(the physical machine)</span>
		</span>
		<input
			bind:value={deviceGroup}
			type="text"
			list="device-groups"
			placeholder="Laptop A"
			required
			disabled={busy}
			class="w-full rounded border border-ink-700 bg-ink-850 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
		/>
		<datalist id="device-groups">
			{#each experiment.deviceGroups as group (group)}
				<option value={group}></option>
			{/each}
		</datalist>
	</label>

	<div class="sm:col-span-2">
		<button
			type="submit"
			disabled={!canSubmit || busy}
			class="rounded bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
		>
			{busy ? 'Working…' : 'Generate Fingerprint'}
		</button>
		<span class="ml-3 text-xs text-ink-400">
			Samples with the same Device Group are treated as the same physical device.
		</span>
	</div>
</form>

{#if progress}
	<div class="mt-4 rounded border border-ink-800 bg-ink-850 p-3">
		<div class="flex items-center justify-between text-sm">
			<span class:text-alert={progress.phase === 'error'} class="text-ink-100">
				{progress.message}
			</span>
			<span class="numeric text-xs text-ink-400">{Math.round(progress.fraction * 100)}%</span>
		</div>
		<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
			<div
				class="h-full rounded-full transition-all duration-200"
				class:bg-accent={progress.phase !== 'error'}
				class:bg-alert={progress.phase === 'error'}
				style="width: {progress.fraction * 100}%"
			></div>
		</div>
	</div>
{/if}

{#if error}
	<p class="mt-4 rounded border border-alert/50 bg-alert/10 p-3 text-sm text-alert">
		Fingerprint generation failed: {error}
	</p>
{/if}

{#if lastFingerprint}
	<div class="mt-4 rounded border border-ink-800 bg-ink-850 p-3 text-sm">
		<p class="text-signal">
			Saved. {lastFingerprint.features.length} features from {AUDIO_TESTS.length} audio tests, rendered
			at {lastFingerprint.sampleRate} Hz.
		</p>
		<details class="mt-2">
			<summary class="cursor-pointer text-xs text-ink-400">Inspect the raw fingerprint</summary>
			<pre
				class="numeric mt-2 max-h-64 overflow-auto rounded bg-ink-950 p-2 text-[11px] text-ink-300">{JSON.stringify(
					{
						version: lastFingerprint.version,
						sampleRate: lastFingerprint.sampleRate,
						features: lastFingerprint.features
					},
					null,
					1
				)}</pre>
		</details>
	</div>
{/if}

<details class="mt-4">
	<summary class="cursor-pointer text-sm text-ink-400">
		What the {AUDIO_TESTS.length} audio tests do
	</summary>
	<ul class="mt-2 space-y-1 text-sm text-ink-300">
		{#each AUDIO_TESTS as test (test.id)}
			<li><span class="numeric text-accent">{test.id}</span> — {test.description}</li>
		{/each}
	</ul>
</details>
