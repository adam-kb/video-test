"use client"

import { colors } from "app/styles/colors.css"
import textStyles from "app/styles/text"
import { HERO_IN, HERO_OUT } from "app/visual-tests/scrub-video/bendConfig"
import gsap, { ScrollTrigger, SplitText } from "gsap/all"
import { css, f, styled } from "library/styled"
import { useAnimation } from "library/useAnimation"
import { useRef, useState } from "react"

gsap.registerPlugin(ScrollTrigger, SplitText)

/**
 * how far below its resting place a line starts, in px
 */
const RISE = 60

/**
 * blur while a line is still travelling, in px
 */
const BLUR = 14

/**
 * how much of the rise is spent staggering between lines, 0-1
 */
const LINE_STAGGER = 0.55

/**
 * how much of the rise the cloth wave takes to cross a line, 0-1. this is the
 * cloth: the line
 * doesn't arrive as one rigid bar, a wave runs through it left to right and the
 * tail settles a beat after the head.
 */
const CLOTH_SWEEP = 0.16

/**
 * how much further the trailing characters of a line lag, in px
 */
const CLOTH_DEPTH = 18

/**
 * the opening copy, overlaid on the artwork rather than stacked above it — it
 * belongs to the same section, early in the clip, before the stats arrive.
 */
export default function HeroIntro({ replayable = false }: { replayable?: boolean }) {
	const scope = useRef<HTMLDivElement>(null)
	const [run, setRun] = useState(0)

	useAnimation(
		() => {
			const el = scope.current
			if (!el) return

			const risers = el.querySelectorAll("[data-rise]")
			if (!risers.length) return

			const split = SplitText.create(risers, {
				type: "lines,words,chars",
				charsClass: "chr",
			})

			// one normalised timeline covering rise, hold and exit. its 0-1 maps onto
			// HERO_IN.start -> HERO_OUT.end, so the hold in the middle is real time
			// at rest rather than a gap we have to keep two triggers agreed on.
			const total = HERO_OUT.end - HERO_IN.start
			const inDuration = (HERO_IN.end - HERO_IN.start) / total
			const outAt = (HERO_OUT.start - HERO_IN.start) / total
			const outDuration = (HERO_OUT.end - HERO_OUT.start) / total

			const timeline = gsap.timeline({ paused: true })
			const blocks = [...split.lines, ...el.querySelectorAll("[data-rise-block]")]

			blocks.forEach((line, index) => {
				const chars = line.querySelectorAll(".chr")
				const lead = (index / blocks.length) * inDuration * LINE_STAGGER

				// blur lives on the line, not the characters, so each line is a single
				// composited layer rather than forty
				timeline
					.fromTo(
						line,
						{ y: RISE, autoAlpha: 0, filter: `blur(${BLUR}px)` },
						{
							y: 0,
							autoAlpha: 1,
							filter: "blur(0px)",
							duration: inDuration - lead,
							ease: "power3.out",
						},
						lead,
					)
					// the wave through the line — it flexes rather than arriving rigid
					.fromTo(
						chars.length ? chars : line,
						{ y: CLOTH_DEPTH },
						{
							y: 0,
							duration: inDuration * 0.9,
							ease: "power2.out",
							stagger: {
								each: (inDuration * CLOTH_SWEEP) / Math.max(chars.length, 1),
								from: "start",
							},
						},
						lead + inDuration * 0.05,
					)
			})

			// and the exit: up, out of focus, gone. same shape as the entrance
			// reversed, so the copy leaves the way it arrived.
			timeline.to(
				blocks,
				{
					y: -RISE,
					autoAlpha: 0,
					filter: `blur(${BLUR}px)`,
					duration: outDuration,
					ease: "power2.in",
					stagger: (outDuration * LINE_STAGGER) / Math.max(blocks.length, 1),
				},
				outAt,
			)

			const track = el.closest("[data-track]")

			// standalone tuning route: no scrubbed section around it, so just play
			if (!track) {
				timeline.play()
				return () => split.revert()
			}

			const state = { progress: 0 }
			gsap.to(state, {
				progress: 1,
				ease: "none",
				scrollTrigger: { trigger: track, start: "top top", end: "bottom bottom", scrub: true },
			})

			const apply = () => {
				timeline.progress(gsap.utils.clamp(0, 1, (state.progress - HERO_IN.start) / total))
			}
			gsap.ticker.add(apply)

			return () => {
				gsap.ticker.remove(apply)
				split.revert()
			}
		},
		[run],
		{ recreateOnResize: true },
	)

	return (
		<Overlay>
			{replayable && (
				<Replay type="button" onClick={() => setRun((n) => n + 1)}>
					replay
				</Replay>
			)}

			<Copy ref={scope}>
				<Heading data-rise>
					GO 1 brings
					<br />
					private AI on-prem
				</Heading>
				<Body data-rise>
					Run go.os inside your institution, with local inference, governed access, and no public
					cloud dependency.
				</Body>
				<Cta data-rise-block>
					Try The <Accent>Go1</Accent>
				</Cta>
			</Copy>
		</Overlay>
	)
}

// eyedropped from the reference recording — swap for real figma tokens
const body = "#B8BAC4"
const accent = "#4B5BF5"

const Overlay = styled("div", [
	f.responsive(css`
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 40px 24px 96px;
		pointer-events: none;
	`),
])

const Replay = styled("button", [
	f.unresponsive(css`
		position: absolute;
		top: 12px;
		right: 12px;
		border: 1px solid #444;
		border-radius: 4px;
		padding: 6px 10px;
		background: transparent;
		color: #ddd;
		font-family: monospace;
		font-size: 11px;
		cursor: pointer;
	`),
])

const Copy = styled("div", [
	f.responsive(css`
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 28px;
	`),
])

const Heading = styled("h1", [
	f.responsive(css`
		${textStyles.h6Sans};
		margin: 0;
		color: ${colors.white};

		/* splittext wraps each line in a child; keep it from breaking further */
		& > * {
			will-change: transform, filter, opacity;
		}
	`),
])

const Body = styled("p", [
	f.responsive(css`
		${textStyles.p1};
		margin: 0;
		max-width: 340px;
		color: ${body};

		& > * {
			will-change: transform, filter, opacity;
		}
	`),
])

const Cta = styled("div", [
	f.responsive(css`
		${textStyles.p1};
		border: 1px solid #2a2a30;
		border-radius: 999px;
		padding: 16px 32px;
		background: #101014;
		color: ${colors.white};
		will-change: transform, filter, opacity;
	`),
])

const Accent = styled("span", [
	f.responsive(css`
		color: ${accent};
	`),
])
