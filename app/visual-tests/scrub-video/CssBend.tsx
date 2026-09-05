"use client"

import type { RefObject } from "react"

import {
	BLOCK_STAGGER,
	FOLD_INSET,
	FOLD_RADIUS,
	PERSPECTIVE,
	REVEAL,
	foldAt,
	foldTrigger,
} from "app/visual-tests/scrub-video/bendConfig"
import gsap, { SplitText } from "gsap/all"
import { useAnimation } from "library/useAnimation"

gsap.registerPlugin(SplitText)

const DEG = 180 / Math.PI
// arc at which a glyph reaches a quarter turn and its opacity hits zero
const HIDDEN_ARC = FOLD_RADIUS * (Math.PI / 2)
const ease = gsap.parseEase("power2.out")

/**
 * approximates the fold with per-character transforms.
 *
 * characters, not words — the curl is far tighter than a word is wide, so
 * word-level facets step visibly across it.
 *
 * each glyph rotates about its own left edge under its own perspective, so the
 * foreshortening is real rather than a flat squash. per-glyph perspective means
 * every glyph's vanishing point sits at its own centre, which gives pure
 * horizontal shortening with no vertical drift — a single shared vanishing
 * point bows the fold into a crooked line.
 *
 * note this cannot be a plain tween. the fold is fixed in screen space and the
 * text moves through it, so every glyph's transform depends on where it
 * currently is and has to be recomputed each frame. that per-frame cost across
 * ~150 glyphs is what the comparison measures — the shader gets it free.
 */
export function useCssBend(root: RefObject<HTMLDivElement | null>, enabled: boolean) {
	useAnimation(
		() => {
			if (!enabled) return

			const el = root.current
			const trigger = el?.closest("[data-track]")
			if (!el || !trigger) return

			const stage = el.getBoundingClientRect()
			if (!stage.width) return

			const splits: SplitText[] = []
			const everyTarget: HTMLElement[] = []
			const glyphs: {
				left: number
				corner: number
				travel: number
				block: number
				setX: (value: number) => void
				setRotate: (value: number) => void
				setFade: (value: number) => void
			}[] = []

			const blocks = Array.from(el.children) as HTMLElement[]

			blocks.forEach((block, index) => {
				// this block's own corner, fixed at its resting right edge
				const box = block.getBoundingClientRect()
				const corner = (box.right - stage.left) / stage.width - FOLD_INSET

				// how far the block has to start right of its corner for even its
				// LEFTMOST glyph to be wrapped past the point of invisibility. a fixed
				// constant can't do this: if it's short of the block's own width the
				// left of the copy never reaches the corner at all and simply sits
				// there in plain sight, which is exactly what a hardcoded 0.45 did.
				const travel = corner - (box.left - stage.left) / stage.width + HIDDEN_ARC + 0.02

				const split = SplitText.create(block.querySelectorAll("[data-bend]"), {
					type: "words,chars",
				})
				splits.push(split)

				// the figure's value and unit are split individually, so its flex row
				// is never re-wrapped and the capsize spans stay intact. folding it as
				// one rigid piece made wide figures shear against the copy around them
				const targets = split.chars as HTMLElement[]

				gsap.set(targets, {
					transformOrigin: "left center",
					transformPerspective: PERSPECTIVE,
					backfaceVisibility: "hidden",
				})

				everyTarget.push(...targets)

				for (const target of targets) {
					const rect = target.getBoundingClientRect()
					glyphs.push({
						left: (rect.left - stage.left) / stage.width,
						corner,
						travel,
						block: index,
						setX: gsap.quickSetter(target, "x", "px") as (v: number) => void,
						setRotate: gsap.quickSetter(target, "rotationY", "deg") as (v: number) => void,
						setFade: gsap.quickSetter(target, "opacity") as (v: number) => void,
					})
				}
			})

			const state = { progress: 0 }
			gsap.to(state, {
				progress: 1,
				ease: "none",
				scrollTrigger: { trigger, ...foldTrigger },
			})

			const span = 1 - BLOCK_STAGGER * (blocks.length - 1)
			const window = REVEAL.end - REVEAL.start

			// once everything has landed, strip the transforms entirely rather than
			// writing an identity matrix every frame — a transformed element is
			// composited and rasterises text with grayscale aa, so the resting state
			// would stay subtly lighter than untouched copy
			let settled = false

			const apply = () => {
				// the trigger spans the whole section, so remap onto the reveal window
				const reveal = gsap.utils.clamp(0, 1, (state.progress - REVEAL.start) / window)

				if (reveal >= 0.999) {
					if (settled) return
					settled = true
					gsap.set(everyTarget, { clearProps: "transform,opacity" })
					return
				}
				settled = false

				for (const glyph of glyphs) {
					// stepped per block, never a gradient down the page — a gradient
					// gives neighbouring lines different offsets and shears the fold
					const local = gsap.utils.clamp(0, 1, (reveal - glyph.block * BLOCK_STAGGER) / span)
					const offset = (1 - ease(local)) * glyph.travel
					const folded = foldAt(glyph.left + offset, glyph.corner)

					glyph.setX((folded.x - glyph.left) * stage.width)
					glyph.setRotate(folded.angle * DEG)
					glyph.setFade(folded.fade)
				}
			}

			gsap.ticker.add(apply)

			return () => {
				gsap.ticker.remove(apply)
				for (const split of splits) split.revert()
			}
		},
		[enabled],
		{ recreateOnResize: true },
	)
}
