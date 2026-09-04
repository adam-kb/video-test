"use client"

import s1Mp4 from "app/sections/section1/assets/GoAI_SC1_OUT_V_v14-scrub.mp4"
import s1Webm from "app/sections/section1/assets/GoAI_SC1_OUT_V_v14-scrub.webm"
import s1Source from "app/sections/section1/assets/GoAI_SC1_OUT_V_v14.webm"
import s2Mp4 from "app/sections/section2/assets/GoAI_SC2_OUT_V_v16-scrub.mp4"
import s2Webm from "app/sections/section2/assets/GoAI_SC2_OUT_V_v16-scrub.webm"
import s2Source from "app/sections/section2/assets/GoAI_SC2_OUT_V_v16.webm"
import gsap from "gsap/all"
import { PageCommitSignal } from "library/link/usePageTransition"
import { css, f, styled } from "library/styled"
import { useAnimation } from "library/useAnimation"
import { useRef, useState } from "react"

const formats = {
	source: "source · vp9 + alpha · 1080×1920",
	webm: "vp9 · no alpha · 720×1280 · gop 15",
	mp4: "h.264 · 720×1280 · gop 15",
} as const

type Format = keyof typeof formats

const clips = [
	{ name: "section 1", src: { source: s1Source, webm: s1Webm, mp4: s1Mp4 } },
	{ name: "section 2", src: { source: s2Source, webm: s2Webm, mp4: s2Mp4 } },
]

export default function ScrubVideoTestPage() {
	const [format, setFormat] = useState<Format>("source")

	return (
		<Page>
			<PageCommitSignal />
			<Controls>
				{Object.entries(formats).map(([key, label]) => (
					<FormatButton
						key={key}
						type="button"
						active={key === format}
						onClick={() => setFormat(key as Format)}
					>
						{label}
					</FormatButton>
				))}
			</Controls>

			{clips.map((clip) => (
				<ScrubSection key={clip.name} name={clip.name} format={format} src={clip.src[format]} />
			))}
		</Page>
	)
}

function ScrubSection({ name, format, src }: { name: string; format: Format; src: string }) {
	const track = useRef<HTMLDivElement>(null)
	const video = useRef<HTMLVideoElement>(null)
	const readout = useRef<HTMLParagraphElement>(null)

	useAnimation(() => {
		const el = video.current
		if (!el || !track.current) return

		const state = { progress: 0 }
		let worst = 0

		gsap.to(state, {
			progress: 1,
			ease: "none",
			scrollTrigger: {
				trigger: track.current,
				start: "top top",
				end: "bottom bottom",
				scrub: true,
			},
		})

		const seek = () => {
			const { duration } = el
			if (!duration) return

			const target = state.progress * duration
			const behind = Math.abs(el.currentTime - target)
			worst = Math.max(worst, behind)

			if (readout.current)
				readout.current.textContent = `${target.toFixed(2)}s / ${duration.toFixed(2)}s · behind ${Math.round(behind * 1000)}ms · worst ${Math.round(worst * 1000)}ms`

			// seeking again while a seek is in flight throws away the decode work
			// already in progress, which is what turns a slow codec into a stuck one
			if (el.seeking) return
			// nothing to gain from seeking less than half a frame
			if (behind < 1 / 60) return

			el.currentTime = target
		}

		gsap.ticker.add(seek)
		return () => gsap.ticker.remove(seek)
	}, [src])

	return (
		<Track ref={track}>
			<Stage>
				<Video
					// force a fresh element rather than swapping src on the old one,
					// which leaves the previously decoded frame on screen in safari
					key={src}
					ref={video}
					src={src}
					preload="auto"
					muted
					playsInline
					disablePictureInPicture
					disableRemotePlayback
					// ios won't paint anything until it has been asked for a frame
					onLoadedMetadata={(e) => {
						e.currentTarget.currentTime = 0
					}}
				/>
				<Hud>
					<HudLine>
						{name} · {formats[format]}
					</HudLine>
					<HudLine ref={readout}>waiting for metadata…</HudLine>
				</Hud>
			</Stage>
		</Track>
	)
}

const Page = styled("div", [
	f.unresponsive(css`
		grid-column: fullbleed;
	`),
])

const Controls = styled("div", [
	f.unresponsive(css`
		position: sticky;
		top: 0;
		z-index: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px;
		background: #111;
		font-family: monospace;
		font-size: 11px;
		line-height: 1.4;
	`),
])

const FormatButton = styled("button", {
	base: [
		f.unresponsive(css`
			border: 1px solid #555;
			border-radius: 4px;
			padding: 6px 8px;
			background: transparent;
			color: #ddd;
			font: inherit;
			cursor: pointer;
		`),
	],
	variants: {
		active: {
			true: [{ background: "#eee", borderColor: "#eee", color: "#111" }],
			false: [],
		},
	},
	defaultVariants: { active: false },
})

const Track = styled("div", [
	f.unresponsive(css`
		position: relative;
		height: 400svh;
	`),
])

const Stage = styled("div", [
	f.unresponsive(css`
		position: sticky;
		top: 0;
		height: 100svh;
		overflow: clip;
		background: #000;
	`),
])

const Video = styled("video", [
	f.unresponsive(css`
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	`),
])

const Hud = styled("div", [
	f.unresponsive(css`
		position: absolute;
		left: 8px;
		bottom: 8px;
		padding: 6px 8px;
		border-radius: 4px;
		background: #111c;
		font-family: monospace;
		font-size: 11px;
		line-height: 1.5;
		color: #ddd;
		pointer-events: none;
	`),
])

const HudLine = styled("p", [
	f.unresponsive(css`
		margin: 0;
	`),
])
