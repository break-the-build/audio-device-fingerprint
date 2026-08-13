<script lang="ts">
	/**
	 * Every saved sample compared against every other. Cells are measured
	 * values; the diagonal is a genuine self-comparison, not a filled-in 1.
	 */
	import { similarityMatrix } from '$lib/analysis';
	import { fixed, heatColor } from '$lib/format';
	import type { ComparisonMode, Sample } from '$lib/types';

	interface Props {
		samples: readonly Sample[];
		mode: ComparisonMode;
		threshold: number;
	}

	let { samples, mode, threshold }: Props = $props();

	const matrix = $derived(similarityMatrix(samples, mode));
</script>

{#if samples.length < 2}
	<p class="text-sm text-ink-400">
		Save at least two fingerprints to build a comparison matrix.
	</p>
{:else}
	<div class="overflow-x-auto">
		<table class="numeric min-w-full border-collapse text-xs">
			<thead>
				<tr>
					<th class="sticky left-0 z-10 bg-ink-900 p-2 text-left font-medium text-ink-300">
						normalized score
					</th>
					{#each samples as sample (sample.id)}
						<th class="p-2 text-center font-medium text-ink-300 whitespace-nowrap">
							{sample.label}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each samples as rowSample, i (rowSample.id)}
					<tr>
						<th
							class="sticky left-0 z-10 bg-ink-900 p-2 text-left font-medium whitespace-nowrap text-ink-300"
						>
							{rowSample.label}
							<span class="block text-[10px] font-normal text-ink-400">
								{rowSample.deviceGroup}
							</span>
						</th>
						{#each samples as colSample, j (colSample.id)}
							{@const score = matrix[i][j]}
							<td
								class="border border-ink-900 p-2 text-center"
								class:font-semibold={i !== j && score >= threshold}
								style="background-color: {heatColor(score)}"
								title="{rowSample.label} ↔ {colSample.label}"
							>
								{fixed(score, 3)}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="mt-2 text-xs text-ink-400">
		Bold cells are at or above the experimental threshold of {threshold.toFixed(3)}. The
		threshold is a setting you chose, not a property of the data.
	</p>
{/if}
