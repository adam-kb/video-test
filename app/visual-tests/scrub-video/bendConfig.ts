/**
 * shared shape of the fold, so the css and webgl variants can't drift apart.
 *
 * every stat block has its OWN corner, fixed at that block's right edge. the
 * block starts pushed right of its corner and slides left, so its copy bends
 * around the corner and straightens out as it passes.
 *
 * the wrap is a real rotation: each glyph turns away from the viewer about its
 * own left edge, under its OWN perspective. per-glyph perspective is what keeps
 * this from going crooked — one shared vanishing point for the whole stage
 * converges vertically as well as horizontally, so glyphs high on the page
 * drift down and low ones drift up, bowing the fold. giving each glyph its own
 * vanishing point at its own centre leaves pure horizontal foreshortening.
 *
 * nothing here may be named `css`, `f` or `styled`: the vanilla split loader
 * tracks those identifiers and will drag the style system into the browser
 * bundle if it sees them.
 */

/** cylinder radius in stage-widths. smaller = a more abrupt squeeze */
export const FOLD_RADIUS = 0.1

/** nudge each corner left of its block's right edge, in stage-widths */
export const FOLD_INSET = 0

/**
 * how far right of its corner a block starts, in stage-widths.
 *
 * only the webgl path uses this constant. the css path measures each block and
 * derives its own travel, because a value short of the block's width leaves the
 * left of the copy never reaching the corner — visible from the very first
 * frame instead of curling into view.
 */
export const TRAVEL = 0.8

/** per-glyph perspective, in px. lower = stronger foreshortening */
export const PERSPECTIVE = 420

/** delay between blocks emerging, as a fraction of the scroll window */
export const BLOCK_STAGGER = 0.1

/**
 * the reveal window, in CLIP PROGRESS (0-1 through the artwork) rather than in
 * track percentages.
 *
 * this matters. expressed as "X% top" the two ends are percentages of the
 * track's height, so moving the start also changes how long the animation runs
 * — pull the start earlier and the fold begins sooner but plays slower, and the
 * moment the copy actually lands barely moves. in clip progress the two are
 * independent: start is when, end is when, and the duration is the gap.
 *
 * it also makes the reveal immune to the track's height. the fold trigger now
 * spans the whole section, exactly like the artwork's own scrub, and the window
 * is applied inside it. make the track taller and the same beats simply get
 * more scroll distance each — no percentages to recompute.
 *
 * TUNING — one frame of the 200-frame sequence is 0.005 of progress.
 *
 *   start   when the copy begins curling out. later = bigger.
 *   end     when it has fully landed and gone flat.
 *   the gap between them is the duration, so moving one end alone also changes
 *   the speed; move both by the same amount to reschedule without respeeding.
 *
 * currently frames 79 -> 119 of 199, a 40-frame reveal.
 */
export const REVEAL = { start: 0.49, end: 0.598 }

/**
 * spans the whole section, matching the artwork's scrub, so both read the same
 * progress. the window above is applied within it.
 */
export const foldTrigger = {
	start: "top top",
	end: "bottom bottom",
	scrub: true,
} as const

/**
 * where a point currently at `u` lands, given the corner it wraps around.
 * both are fractions of the stage width.
 *
 * `angle` is the rotation to apply about the glyph's left edge; perspective
 * supplies the foreshortening, so callers rotate rather than scale. the angle
 * stops at a quarter turn — past that a glyph would face away entirely.
 */
export function foldAt(u: number, corner: number) {
	const arc = u - corner
	if (arc <= 0) return { x: u, scale: 1, fade: 1, angle: 0 }

	const angle = Math.min(arc / FOLD_RADIUS, Math.PI / 2)
	const scale = Math.cos(angle)

	return {
		x: corner + FOLD_RADIUS * Math.sin(angle),
		scale,
		// square it so glyphs disappear well before they're edge-on. a linear or
		// held fade leaves everything from 0-70deg fully opaque, and they stack up
		// against the corner into an unreadable smear.
		fade: scale * scale,
		angle,
	}
}
