"use client"

import gsap from "gsap/all"
import { css, f, styled } from "library/styled"
import { useAnimation } from "library/useAnimation"
import { useEffect, useRef, useState } from "react"

/**
 * scrubs a pre-rendered frame sequence onto a canvas.
 *
 * the whole point is that seeking is an array lookup rather than a decode: a
 * video has to find the nearest keyframe and decode forward to reach a given
 * time, and that latency isn't ours to control. here frame n is image n, so the
 * playhead physically cannot fall behind.
 *
 * frames are held as HTMLImageElements, not ImageBitmaps. a decoded 540x960
 * bitmap is ~2MB, so 210 of them would be ~430MB of resident pixels and iOS
 * would kill the tab. leaving them as elements lets the browser's own image
 * cache decide what stays decoded, at the cost of an occasional decode on draw.
 */
/**
 * index of the stored frame closest to `progress`. the list is ascending, so a
 * binary search keeps this off the hot path's budget even at a few hundred
 * frames.
 */
function nearest(positions: number[], progress: number) {
	let lo = 0
	let hi = positions.length - 1

	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if ((positions[mid] ?? 0) < progress) lo = mid + 1
		else hi = mid
	}

	const here = positions[lo] ?? 0
	const prev = positions[lo - 1]
	if (prev !== undefined && Math.abs(prev - progress) < Math.abs(here - progress)) return lo - 1
	return lo
}

export default function SequencePlayer({
	dir,
	count,
	manifestUrl,
	onStatus,
}: {
	dir: string
	count: number
	/**
	 * json holding the progress position (0-1) of each stored frame, for
	 * sequences whose frames aren't evenly spaced in time. without it, frames
	 * are assumed uniform.
	 */
	manifestUrl?: string
	onStatus?: (text: string) => void
}) {
	const host = useRef<HTMLDivElement>(null)
	const canvas = useRef<HTMLCanvasElement>(null)
	const [manifest, setManifest] = useState<number[]>()

	useEffect(() => {
		if (!manifestUrl) return

		let live = true
		fetch(manifestUrl)
			.then((response) => response.json() as Promise<{ progress: number[] }>)
			.then((data) => {
				if (live) setManifest(data.progress)
			})
			.catch(() => {})

		return () => {
			live = false
		}
	}, [manifestUrl])

	// wait for the timing map rather than drawing the sequence at the wrong speed
	const waiting = Boolean(manifestUrl) && !manifest

	useAnimation(() => {
		if (waiting) return

		const el = host.current
		const surface = canvas.current
		const trigger = el?.closest("[data-track]")
		if (!el || !surface || !trigger) return

		const context = surface.getContext("2d", { alpha: false })
		if (!context) return

		const frames: HTMLImageElement[] = []
		let ready = 0
		let cancelled = false

		// kick every request off at once and let the browser queue them. they're
		// tiny and same-origin, so head-of-line blocking isn't worth managing here
		for (let i = 0; i < count; i++) {
			const image = new Image()
			image.src = `${dir}/${String(i).padStart(4, "0")}.webp`
			image.decoding = "async"
			frames.push(image)

			const settle = () => {
				if (cancelled) return
				ready += 1
			}
			image.decode().then(settle).catch(settle)
		}

		// declared up here because resize() invalidates it and runs immediately,
		// before the render loop below is set up
		let drawn = -1

		const dpr = Math.min(window.devicePixelRatio, 2)
		const resize = () => {
			surface.width = Math.round(el.clientWidth * dpr)
			surface.height = Math.round(el.clientHeight * dpr)
			drawn = -1
		}

		const observer = new ResizeObserver(resize)
		observer.observe(el)
		resize()

		const state = { progress: 0 }
		gsap.to(state, {
			progress: 1,
			ease: "none",
			scrollTrigger: {
				trigger,
				start: "top top",
				end: "bottom bottom",
				scrub: true,
			},
		})

		let worstFrame = 0
		let shownFrame = 0
		let ticks = 0

		const render = (_time: number, deltaTime: number) => {
			worstFrame = Math.max(worstFrame, deltaTime)
			ticks += 1
			if (ticks >= 60) {
				shownFrame = worstFrame
				worstFrame = 0
				ticks = 0
			}

			const index = manifest
				? nearest(manifest, state.progress)
				: gsap.utils.clamp(0, count - 1, Math.round(state.progress * (count - 1)))

			onStatus?.(
				`frame ${index}/${count - 1} · loaded ${ready}/${count} · frame ${Math.round(shownFrame)}ms`,
			)

			if (index === drawn) return

			const image = frames[index]
			if (!image?.complete || !image.naturalWidth) return
			drawn = index

			// cover: fill the stage, cropping the overflow axis
			const scale = Math.max(
				surface.width / image.naturalWidth,
				surface.height / image.naturalHeight,
			)
			const w = image.naturalWidth * scale
			const h = image.naturalHeight * scale
			context.drawImage(image, (surface.width - w) / 2, (surface.height - h) / 2, w, h)
		}

		gsap.ticker.add(render)

		return () => {
			cancelled = true
			gsap.ticker.remove(render)
			observer.disconnect()
			// drop the references so the browser can reclaim the decoded cache
			for (const image of frames) image.src = ""
			frames.length = 0
		}
	}, [dir, count, manifest, waiting])

	return (
		<Host ref={host}>
			<Surface ref={canvas} />
		</Host>
	)
}

const Host = styled("div", [
	f.unresponsive(css`
		position: absolute;
		inset: 0;
		background: #000;
	`),
])

const Surface = styled("canvas", [
	f.unresponsive(css`
		display: block;
		width: 100%;
		height: 100%;
	`),
])
