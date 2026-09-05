"use client"

import s1Mp4 from "app/sections/section1/assets/GoAI_SC1_OUT_V_v14-scrub.mp4"
import s1Webm from "app/sections/section1/assets/GoAI_SC1_OUT_V_v14-scrub.webm"
import s1Source from "app/sections/section1/assets/GoAI_SC1_OUT_V_v14.webm"
import s2Mp4 from "app/sections/section2/assets/GoAI_SC2_OUT_V_v16-scrub.mp4"
import s2Webm from "app/sections/section2/assets/GoAI_SC2_OUT_V_v16-scrub.webm"
import s2Source from "app/sections/section2/assets/GoAI_SC2_OUT_V_v16.webm"
import textStyles from "app/styles/text"
import { useCssBend } from "app/visual-tests/scrub-video/CssBend"
import HeroIntro from "app/visual-tests/scrub-video/HeroIntro"
import gsap from "gsap/all"
import { PageCommitSignal } from "library/link/usePageTransition"
import { css, f, styled } from "library/styled"
import { useAnimation } from "library/useAnimation"
import { Suspense, lazy, useRef, useState } from "react"

const WebglBend = lazy(() => import("app/visual-tests/scrub-video/WebglBend"))
const SequencePlayer = lazy(() => import("app/visual-tests/scrub-video/SequencePlayer"))

const formats = {
	source: "source · vp9 + alpha · 1080×1920",
	webm: "vp9 · no alpha · 720×1280 · gop 15",
	mp4: "h.264 · 720×1280 · gop 15",
	seq100: "img seq · 100 uniform · 1.1MB",
	seq200: "img seq · 200 uniform · 2.3MB",
	seqAdaptive: "img seq · 118 motion-weighted · 1.5MB",
} as const

type Format = keyof typeof formats

// section 1 only, straight from the prores master rather than the lossy webm
type SequenceKey = "seq100" | "seq200" | "seqAdaptive"
type Sequence = { dir: string; count: number; manifestUrl?: string }

const sequences: Record<SequenceKey, Sequence> = {
	seq100: { dir: "/scrub-seq/s1-100", count: 100 },
	seq200: { dir: "/scrub-seq/s1-200", count: 200 },
	seqAdaptive: {
		dir: "/scrub-seq/s1-adaptive",
		count: 118,
		manifestUrl: "/scrub-seq/s1-adaptive/manifest.json",
	},
}

const isSequence = (format: Format): format is SequenceKey => format in sequences

const techniques = {
	slide: "slide · transform only",
	css3d: "css 3d · splittext lines",
	webgl: "webgl · bent textured plane",
} as const

type Technique = keyof typeof techniques

const clips = [
	{ name: "section 1", src: { source: s1Source, webm: s1Webm, mp4: s1Mp4 } },
	{ name: "section 2", src: { source: s2Source, webm: s2Webm, mp4: s2Mp4 } },
]

export default function ScrubVideoTestPage() {
	const [format, setFormat] = useState<Format>("mp4")
	const [technique, setTechnique] = useState<Technique>("css3d")

	return (
		<Page>
			<PageCommitSignal />
			<Controls>
				<Drawer>
					<DrawerSummary>
						{formats[format].split(" · ")[0]} · {techniques[technique].split(" · ")[0]}
					</DrawerSummary>
					<ControlRow>
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
					</ControlRow>
					<ControlRow>
						{Object.entries(techniques).map(([key, label]) => (
							<FormatButton
								key={key}
								type="button"
								active={key === technique}
								onClick={() => setTechnique(key as Technique)}
							>
								{label}
							</FormatButton>
						))}
					</ControlRow>
				</Drawer>
			</Controls>

			<Eyebrow>
				<span>GO.OS</span>
				<span>ON-PREM</span>
				<span>GOVERNED</span>
			</Eyebrow>

			{clips.map((clip, index) => {
				// only section 1 has a sequence; section 2 falls back to h.264
				const sequence = index === 0 && isSequence(format) ? sequences[format] : undefined
				const videoSrc = isSequence(format) ? clip.src.mp4 : clip.src[format]

				return (
					<ScrubSection
						key={clip.name}
						name={clip.name}
						format={format}
						src={videoSrc}
						sequence={sequence}
					>
						{index === 0 && (
							<>
								<HeroIntro />
								<StatsOverlay technique={technique} />
							</>
						)}
					</ScrubSection>
				)
			})}
		</Page>
	)
}

function ScrubSection({
	name,
	format,
	src,
	sequence,
	children,
}: {
	name: string
	format: Format
	src: string
	sequence?: Sequence
	children?: React.ReactNode
}) {
	const track = useRef<HTMLDivElement>(null)
	const video = useRef<HTMLVideoElement>(null)
	const readout = useRef<HTMLParagraphElement>(null)

	useAnimation(() => {
		// the sequence player owns its own scrub and readout
		if (sequence) return

		const el = video.current
		if (!el || !track.current) return

		const state = { progress: 0 }
		let worst = 0
		let worstFrame = 0
		let shownFrame = 0
		let ticks = 0

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

		const seek = (_time: number, deltaTime: number) => {
			// rolling worst frame over ~1s, so the number tracks whichever bend
			// technique is mounted rather than the worst thing that ever happened
			worstFrame = Math.max(worstFrame, deltaTime)
			ticks += 1
			if (ticks >= 60) {
				shownFrame = worstFrame
				worstFrame = 0
				ticks = 0
			}

			const { duration } = el
			if (!duration) return

			const target = state.progress * duration
			const behind = Math.abs(el.currentTime - target)
			worst = Math.max(worst, behind)

			if (readout.current)
				readout.current.textContent = `${target.toFixed(2)}s · behind ${Math.round(behind * 1000)}ms · worst ${Math.round(worst * 1000)}ms · frame ${Math.round(shownFrame)}ms`

			// seeking again while a seek is in flight throws away the decode work
			// already in progress, which is what turns a slow codec into a stuck one
			if (el.seeking) return
			// nothing to gain from seeking less than half a frame
			if (behind < 1 / 60) return

			el.currentTime = target
		}

		// ios won't paint a frame for a video that has never played, and assigning
		// currentTime = 0 when it's already 0 doesn't count as a seek, so nothing
		// decodes. nudge off zero and run one play/pause to force a frame out.
		let primed = false
		const prime = () => {
			if (primed || !el.duration) return
			primed = true
			el.currentTime = 0.001
			el.play()
				.then(() => el.pause())
				.catch(() => {
					// low power mode refuses autoplay — wait for a touch and retry
					primed = false
				})
		}

		el.addEventListener("loadedmetadata", prime)
		document.addEventListener("touchstart", prime, { passive: true })
		if (el.readyState >= 1) prime()

		gsap.ticker.add(seek)
		return () => {
			gsap.ticker.remove(seek)
			el.removeEventListener("loadedmetadata", prime)
			document.removeEventListener("touchstart", prime)
		}
	}, [src, sequence])

	return (
		<Track ref={track} data-track>
			<Stage>
				{sequence ? (
					<Suspense fallback={null}>
						<SequencePlayer
							dir={sequence.dir}
							count={sequence.count}
							manifestUrl={sequence.manifestUrl}
							onStatus={(text) => {
								if (readout.current) readout.current.textContent = text
							}}
						/>
					</Suspense>
				) : (
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
					/>
				)}
				{children}
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

const stats = [
	{
		value: "8",
		unit: "GPUs",
		body: "from NVIDIA, enabling massive parallel compute for inference and fine-tuning",
	},
	{
		value: "2,000",
		unit: "users",
		body: "concurrently served from a single appliance",
		underline: true,
	},
	{
		value: "800",
		unit: "GB/S",
		body: "of memory bandwidth",
	},
]

function StatsOverlay({ technique }: { technique: Technique }) {
	const root = useRef<HTMLDivElement>(null)

	useAnimation(() => {
		if (technique !== "slide") return

		const el = root.current
		const trigger = el?.closest("[data-track]")
		if (!el || !trigger) return

		gsap
			.timeline({
				scrollTrigger: {
					trigger,
					// lands over the back half of the clip
					start: "38% top",
					end: "62% top",
					scrub: true,
				},
			})
			.fromTo(
				gsap.utils.toArray<HTMLElement>(el.children),
				{ xPercent: 100, opacity: 0 },
				{
					xPercent: 0,
					opacity: 1,
					duration: 1,
					ease: "power2.out",
					stagger: 0.4,
				},
			)
	}, [technique])

	useCssBend(root, technique === "css3d")

	// the gl variant rasterizes its own copy, so the dom version steps aside
	if (technique === "webgl")
		return (
			<Suspense fallback={null}>
				<WebglBend stats={stats} />
			</Suspense>
		)

	return (
		<Stats ref={root}>
			{stats.map((stat) => (
				<StatBlock key={stat.value} mode={technique === "css3d" ? "dimensional" : "flat"}>
					<Kicker data-bend>Up to</Kicker>
					<Figure>
						<Value data-bend>{stat.value}</Value>
						<Unit data-bend>{stat.unit}</Unit>
					</Figure>
					<Body data-bend underline={Boolean(stat.underline)}>
						{stat.body}
					</Body>
				</StatBlock>
			))}
		</Stats>
	)
}

/**
 * fixed rather than per-section: this strip is present on every frame of the
 * reference, so it outlives whatever section is passing behind it
 */
const Eyebrow = styled("div", [
	f.responsive(css`
		position: fixed;
		z-index: 3;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: space-between;
		padding: 24px;
		${textStyles.p2};
		color: #8a8c94;
		letter-spacing: 0.08em;
		pointer-events: none;
		mix-blend-mode: difference;
	`),
])

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
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background: #111;
		font-family: monospace;
		font-size: 11px;
		line-height: 1.4;
	`),
])

/**
 * native <details>, so the open/closed state lives in the dom and needs no
 * react state or height animation
 */
const Drawer = styled("details", [
	f.unresponsive(css`
		display: flex;
		flex-direction: column;
		gap: 6px;
	`),
])

const DrawerSummary = styled("summary", [
	f.unresponsive(css`
		align-self: flex-start;
		border: 1px solid #555;
		border-radius: 4px;
		padding: 6px 8px;
		color: #ddd;
		cursor: pointer;
		list-style: none;

		&::after {
			content: " ▸";
		}

		[open] > &::after {
			content: " ▾";
		}

		/* stylelint-disable-next-line selector-no-vendor-prefix */
		&::-webkit-details-marker {
			display: none;
		}
	`),
])

const ControlRow = styled("div", [
	f.unresponsive(css`
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
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
		/* the reveal window is expressed in clip progress, so this height is free
		   to change — taller just means more scroll distance per beat */
		height: 400vh;
	`),
])

const Stage = styled("div", [
	f.unresponsive(css`
		position: sticky;
		top: 0;
		height: 100vh;
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

// colors are eyeballed off the screenshot — swap for the real Figma values
const ink = "#3D3D43"
const accent = "#5B4BE1"

const Stats = styled("div", [
	f.responsive(css`
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 46px;
		padding: 0 30px;
		pointer-events: none;
	`),
])

const StatBlock = styled("div", {
	base: [
		f.responsive(css`
			display: flex;
			flex-direction: column;
			gap: 12px;
			max-width: 220px;
		`),
	],
	variants: {
		// the slide reveal fades whole blocks; the fold fades each glyph as it
		// turns edge-on, so its blocks must not carry an opacity of their own.
		mode: {
			flat: [
				f.responsive(css`
					opacity: 0;
					will-change: transform, opacity;
				`),
			],
			// the glyphs carry their own opacity through the fold, so the block
			// must stay fully opaque
			dimensional: [],
		},
	},
	defaultVariants: { mode: "flat" },
})

const Kicker = styled("p", [
	f.responsive(css`
		${textStyles.p1};
		margin: 0;
		color: ${ink};
		/* splittext wraps each word in a child; keep glyphs from breaking inside */
		& > * {
			white-space: nowrap;
		}
	`),
])

// no text style on this one — it's a flex container, so capsize's
// pseudo-elements would become layout items
const Figure = styled("div", [
	f.responsive(css`
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 10px;
	`),
])

const Value = styled("span", [
	f.responsive(css`
		${textStyles.h5Sans};
		color: ${accent};
		/* splittext wraps each word in a child; keep glyphs from breaking inside */
		& > * {
			white-space: nowrap;
		}
	`),
])

const Unit = styled("span", [
	f.responsive(css`
		${textStyles.h8Sans};
		color: ${ink};
		/* splittext wraps each word in a child; keep glyphs from breaking inside */
		& > * {
			white-space: nowrap;
		}
	`),
])

const Body = styled("p", {
	base: [
		f.responsive(css`
			${textStyles.p1};
			margin: 0;
			color: ${ink};
			/* splittext wraps each word in a child; keep glyphs from breaking inside */
			& > * {
				white-space: nowrap;
			}
		`),
	],
	variants: {
		underline: {
			true: [
				f.responsive(css`
					text-decoration: underline;
					text-decoration-color: ${accent};
					text-decoration-thickness: 1.5px;
					text-underline-offset: 6px;

					/* the fold transforms and fades the CHARACTERS, never this
					   paragraph — so a decoration painted here keeps hanging in the air
					   after every glyph above it has gone, as a row of loose dashes.
					   while the copy is split, let the glyphs carry it instead. */
					&:has(.foldChar) {
						text-decoration: none;
					}

					& .foldChar {
						text-decoration: underline;
						text-decoration-color: ${accent};
						text-decoration-thickness: 1.5px;
						text-underline-offset: 6px;
					}
				`),
			],
			false: [],
		},
	},
	defaultVariants: { underline: false },
})
