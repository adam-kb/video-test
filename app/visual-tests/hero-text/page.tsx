"use client"

import HeroIntro from "app/visual-tests/scrub-video/HeroIntro"
import { PageCommitSignal } from "library/link/usePageTransition"
import { css, f, styled } from "library/styled"

/**
 * the intro on its own with a replay button, for tuning it without scrolling
 * past everything else. in order it lives inside section 1 of the scrub test.
 */
export default function HeroTextPage() {
	return (
		<Stage>
			<PageCommitSignal />
			<HeroIntro replayable />
		</Stage>
	)
}

const Stage = styled("div", [
	f.unresponsive(css`
		grid-column: fullbleed;
		position: relative;
		height: 100svh;
		background: #000;
	`),
])
