<script lang="ts">
	import { shortTime } from '$lib/format';
	import { experiment } from '$lib/state.svelte';
</script>

{#if experiment.droppedOnLoad > 0}
	<p class="mb-3 rounded border border-caution/50 bg-caution/10 p-3 text-sm text-caution">
		{experiment.droppedOnLoad} stored {experiment.droppedOnLoad === 1 ? 'entry' : 'entries'} could
		not be read as a valid sample and {experiment.droppedOnLoad === 1 ? 'was' : 'were'} skipped.
	</p>
{/if}

{#if experiment.samples.length === 0}
	<p class="text-sm text-ink-400">
		No samples saved yet. Generate a fingerprint above to start collecting data.
	</p>
{:else}
	<div class="overflow-x-auto">
		<table class="min-w-full text-sm">
			<thead>
				<tr class="border-b border-ink-800 text-left text-xs tracking-wide text-ink-400 uppercase">
					<th class="p-2">Label</th>
					<th class="p-2">Device Group</th>
					<th class="p-2">Browser</th>
					<th class="numeric p-2">Rate</th>
					<th class="numeric p-2">Dims</th>
					<th class="p-2">Recorded</th>
					<th class="p-2"></th>
				</tr>
			</thead>
			<tbody>
				{#each experiment.samples as sample (sample.id)}
					<tr class="border-b border-ink-850">
						<td class="p-2 font-medium text-ink-100">{sample.label}</td>
						<td class="p-2">
							<input
								value={sample.deviceGroup}
								list="device-groups"
								aria-label="Device group for {sample.label}"
								onchange={(event) =>
									experiment.setGroup(sample.id, event.currentTarget.value.trim())}
								class="w-36 rounded border border-ink-700 bg-ink-850 px-2 py-1 text-xs outline-none focus:border-accent"
							/>
						</td>
						<td class="p-2 text-ink-300">{sample.browser}</td>
						<td class="numeric p-2 text-ink-300">{sample.fingerprint.sampleRate}</td>
						<td class="numeric p-2 text-ink-300">{sample.fingerprint.features.length}</td>
						<td class="p-2 text-xs text-ink-400">{shortTime(sample.createdAt)}</td>
						<td class="p-2 text-right">
							<button
								type="button"
								onclick={() => experiment.remove(sample.id)}
								class="rounded border border-ink-700 px-2 py-1 text-xs text-ink-300 transition hover:border-alert hover:text-alert"
							>
								Delete
							</button>
						</td>
					</tr>
					<tr class="border-b border-ink-800">
						<td colspan="7" class="px-2 pb-2">
							<details>
								<summary class="cursor-pointer text-xs text-ink-400">
									Environment metadata (stored separately from the audio vector)
								</summary>
								<dl
									class="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3"
								>
									{#each Object.entries(sample.environment) as [key, value] (key)}
										<div class="flex justify-between gap-3">
											<dt class="text-ink-400">{key}</dt>
											<dd class="numeric truncate text-right text-ink-300" title={String(value)}>
												{value === null ? 'unavailable' : String(value)}
											</dd>
										</div>
									{/each}
								</dl>
							</details>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
