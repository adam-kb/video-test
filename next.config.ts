import type { NextConfig } from "next"

import { withVanillaSplit } from "./library/vanilla/withVanillaSplit"

const nextConfig: NextConfig = {
	redirects: async () => [{ source: "/home", destination: "/", permanent: false }],

	// type-aware linting checks this separately from next build
	typescript: { ignoreBuildErrors: true },

	experimental: {
		// enable view transition support
		viewTransition: true,
	},

	allowedDevOrigins: ["192.168.0.156"],

	images: {
		qualities: [90],
	},

	// enable react compiler, error when a file can't be compiled
	reactCompiler: { panicThreshold: "all_errors" },

	turbopack: {
		rules: {
			// importing inline SVGs as React components
			// SVGs not caught by this rule will be imported using next image (raster)
			"*.inline.svg": {
				loaders: [{ loader: "@svgr/webpack", options: { ssr: true } }],
				as: "*.js",
			},
			// importing video files gives you a URL to the emitted file
			"*.webm": { type: "asset" },
			"*.mp4": { type: "asset" },
		},
	},
}

export default withVanillaSplit(nextConfig)
