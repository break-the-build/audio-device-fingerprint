import adapter from '@sveltejs/adapter-vercel';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// The app itself is client-side; the adapter only has to serve static
			// assets plus the one stateless /api/fingerprint route.
			//
			// The runtime is pinned rather than inferred from the local Node
			// version, so the build produces the same target on any machine.
			adapter: adapter({ runtime: 'nodejs22.x' })
		})
	]
});
