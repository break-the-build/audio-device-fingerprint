<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Audio Device Fingerprint Experiment</title>
	<meta
		name="description"
		content="A local proof-of-concept for measuring whether Web Audio feature vectors correlate with physical devices across browsers."
	/>
</svelte:head>

{@render children()}
