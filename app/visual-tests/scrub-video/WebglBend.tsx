"use client"

import {
	BLOCK_STAGGER,
	FOLD_INSET,
	FOLD_RADIUS,
	REVEAL,
	TRAVEL,
	foldTrigger,
} from "app/visual-tests/scrub-video/bendConfig"
import gsap from "gsap/all"
import { css, f, styled } from "library/styled"
import { useAnimation } from "library/useAnimation"
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from "ogl"
import { useRef } from "react"

// same eyedropped values as the dom version — swap for real figma tokens
const INK = "#3D3D43"
const ACCENT = "#5B4BE1"

type Stat = { value: string; unit: string; body: string }

// ogl does not prefix shaders, so precision has to be declared here
const vertex = /* glsl */ `
	precision highp float;

	attribute vec3 position;
	attribute vec2 uv;

	uniform mat4 modelViewMatrix;
	uniform mat4 projectionMatrix;
	uniform float uProgress;
	uniform float uFoldRadius;
	uniform float uTravel;
	uniform float uStagger;
	uniform vec3 uBounds;
	uniform vec3 uCorners;
	uniform float uContentLeft;

	varying vec2 vUv;
	varying float vFade;

	void main() {
		// quantised per block, NOT a continuous function of y. a smooth y gradient
		// gives every scanline a slightly different offset, which shears the fold
		// into a diagonal. within a block the delay is constant, so the fold stays
		// a clean vertical line and each line of copy bends purely on its own x.
		// (flipY is on, so canvas-space y is 1 - uv.y)
		float row = 1.0 - uv.y;
		float block =
			step(uBounds.x, row) + step(uBounds.y, row) + step(uBounds.z, row);
		float delay = block * uStagger;

		// every stat wraps around its OWN corner — one shared fold across the whole
		// group reads as a single bend running through unrelated blocks
		float corner = uCorners.x;
		corner = mix(corner, uCorners.y, step(0.5, block));
		corner = mix(corner, uCorners.z, step(1.5, block));
		float local = clamp((uProgress - delay) / max(1.0 - uStagger, 0.001), 0.0, 1.0);
		float eased = 1.0 - pow(1.0 - local, 2.0);

		float u = uv.x + (1.0 - eased) * uTravel;

		float arc = max(u - corner, 0.0);
		// stop at a quarter turn; past that cos goes negative and mirrors the text
		float angle = min(arc / uFoldRadius, 1.5707963);

		// horizontal only. displacing z instead and letting the camera resolve it
		// converges vertically as well, which bows the fold into a crooked line —
		// keeping y and z untouched pins it to one exact vertical edge.
		vec3 p = position;
		p.x = min(u, corner) + uFoldRadius * sin(angle) - 0.5;
		p.z = 0.0;

		// the ripple lands here later — one extra term on x:
		// p.x += sin(u * 20.0 - uTime * 4.0) * uRipple;

		vUv = uv;
		// hold opacity until it's genuinely edge-on, then go
		// squared so glyphs vanish well before edge-on, instead of stacking up
		// against the corner into a smear
		float squash = cos(angle);
		vFade = eased * squash * squash;

		gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
	}
`

const fragment = /* glsl */ `
	precision highp float;

	uniform sampler2D tMap;

	varying vec2 vUv;
	varying float vFade;

	void main() {
		// texture is premultiplied, so scale the whole texel — scaling only .a
		// leaves dark halos around the glyph edges under minification
		gl_FragColor = texture2D(tMap, vUv) * vFade;
	}
`

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
	const lines: string[] = []
	let line = ""

	for (const word of text.split(" ")) {
		const next = line ? `${line} ${word}` : word
		if (line && ctx.measureText(next).width > maxWidth) {
			lines.push(line)
			line = word
		} else {
			line = next
		}
	}
	if (line) lines.push(line)

	return lines
}

/**
 * rasterizes the copy once into a 2d canvas that becomes the gl texture. the
 * copy is short and known, so hand-rolled wrapping is cheaper than standing up
 * an msdf font pipeline.
 */
function drawStats(
	canvas: HTMLCanvasElement,
	stats: Stat[],
	width: number,
	height: number,
	dpr: number,
) {
	const ctx = canvas.getContext("2d")
	if (!ctx) return

	canvas.width = Math.max(1, Math.round(width * dpr))
	canvas.height = Math.max(1, Math.round(height * dpr))
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, width, height)
	ctx.textBaseline = "top"

	const family = getComputedStyle(document.body).fontFamily || "sans-serif"
	const pad = width * 0.08
	const col = width * 0.58
	const kickerSize = width * 0.046
	const valueSize = width * 0.128
	const unitSize = width * 0.082
	const bodyLead = kickerSize * 1.45

	const kickerFont = `500 ${kickerSize}px ${family}`
	const valueFont = `600 ${valueSize}px ${family}`
	const unitFont = `600 ${unitSize}px ${family}`
	const bodyFont = `500 ${kickerSize}px ${family}`

	ctx.font = bodyFont
	const measured = stats.map((stat) => {
		const lines = wrapText(ctx, stat.body, col)
		return {
			stat,
			lines,
			height: kickerSize * 2 + valueSize * 1.05 + kickerSize * 0.6 + lines.length * bodyLead,
		}
	})

	const gap = height * 0.05
	const total = measured.reduce((sum, m) => sum + m.height, 0) + gap * (measured.length - 1)
	let y = Math.max(pad, (height - total) / 2)
	const extents: { top: number; bottom: number }[] = []
	const corners: number[] = []

	for (const { stat, lines } of measured) {
		const blockTop = y
		ctx.fillStyle = INK
		ctx.font = kickerFont
		ctx.fillText("Up to", pad, y)
		y += kickerSize * 2

		ctx.font = valueFont
		ctx.fillStyle = ACCENT
		ctx.fillText(stat.value, pad, y)
		const valueWidth = ctx.measureText(stat.value).width

		ctx.font = unitFont
		ctx.fillStyle = INK
		ctx.fillText(stat.unit, pad + valueWidth + width * 0.028, y + (valueSize - unitSize) * 0.78)
		y += valueSize * 1.05 + kickerSize * 0.6

		ctx.font = bodyFont
		ctx.fillStyle = INK
		for (const line of lines) {
			ctx.fillText(line, pad, y)
			y += bodyLead
		}

		extents.push({ top: blockTop / height, bottom: (y - gap) / height })
		corners.push((pad + col) / width - FOLD_INSET)
		y += gap
	}

	// midpoints between consecutive blocks, padded out to three
	const bounds = [2, 2, 2]
	for (let i = 1; i < extents.length && i <= 3; i++) {
		const above = extents[i - 1]
		const here = extents[i]
		if (above && here) bounds[i - 1] = (above.bottom + here.top) / 2
	}

	while (corners.length < 3) corners.push(1)

	return { bounds, corners, contentLeft: pad / width }
}

export default function WebglBend({ stats }: { stats: Stat[] }) {
	const host = useRef<HTMLDivElement>(null)

	useAnimation(() => {
		const el = host.current
		const trigger = el?.closest("[data-track]")
		if (!el || !trigger) return

		const dpr = Math.min(window.devicePixelRatio, 2)
		const renderer = new Renderer({ alpha: true, dpr })
		const gl = renderer.gl
		el.appendChild(gl.canvas)

		const camera = new Camera(gl, { fov: 35 })
		camera.position.z = 5

		const scene = new Transform()
		const textCanvas = document.createElement("canvas")
		const texture = new Texture(gl, {
			generateMipmaps: true,
			minFilter: gl.LINEAR_MIPMAP_LINEAR,
			magFilter: gl.LINEAR,
			// the curl rakes the texture hard; without anisotropy the glyphs crawl
			anisotropy: 8,
			premultiplyAlpha: true,
		})

		const program = new Program(gl, {
			vertex,
			fragment,
			transparent: true,
			uniforms: {
				tMap: { value: texture },
				uProgress: { value: 0 },
				uFoldRadius: { value: FOLD_RADIUS },
				uTravel: { value: TRAVEL },
				uStagger: { value: BLOCK_STAGGER },
				// boundaries between blocks in canvas space; 2.0 is "never reached"
				uBounds: { value: [2, 2, 2] },
				uCorners: { value: [1, 1, 1] },
				uContentLeft: { value: 0 },
			},
		})
		program.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

		const mesh = new Mesh(gl, {
			// nothing in the fold varies with y, so height segments buy nothing.
			// the curl is tight though, so x needs the density.
			geometry: new Plane(gl, { widthSegments: 96, heightSegments: 1 }),
			program,
		})
		mesh.setParent(scene)

		const resize = () => {
			const width = el.clientWidth
			const height = el.clientHeight
			if (!width || !height) return

			renderer.setSize(width, height)
			camera.perspective({ aspect: width / height })

			// scale the unit plane to exactly fill the frustum at z = 0
			const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
			// z has to share x's scale or the fold's depth won't match its width
			const worldWidth = worldHeight * (width / height)
			mesh.scale.set(worldWidth, worldHeight, worldWidth)

			const layout = drawStats(textCanvas, stats, width, height, dpr)
			if (layout) {
				program.uniforms.uBounds.value = layout.bounds
				program.uniforms.uCorners.value = layout.corners
				program.uniforms.uContentLeft.value = layout.contentLeft
			}
			texture.image = textCanvas
			texture.needsUpdate = true
		}

		resize()
		window.addEventListener("resize", resize)

		const state = { progress: 0 }
		gsap.to(state, {
			progress: 1,
			ease: "none",
			scrollTrigger: { trigger, ...foldTrigger },
		})

		let drawn = -1
		const render = () => {
			// the css variant costs nothing when idle, so this one mustn't either —
			// otherwise the hud comparison is biased before it starts
			if (state.progress === drawn) return
			drawn = state.progress

			// the trigger spans the whole section; remap onto the reveal window
			program.uniforms.uProgress.value = gsap.utils.clamp(
				0,
				1,
				(state.progress - REVEAL.start) / (REVEAL.end - REVEAL.start),
			)
			renderer.render({ scene, camera })
		}
		gsap.ticker.add(render)

		return () => {
			gsap.ticker.remove(render)
			window.removeEventListener("resize", resize)
			gl.canvas.remove()
			gl.getExtension("WEBGL_lose_context")?.loseContext()
		}
	}, [stats])

	return <CanvasHost ref={host} />
}

const CanvasHost = styled("div", [
	f.unresponsive(css`
		position: absolute;
		inset: 0;
		pointer-events: none;

		& canvas {
			display: block;
		}
	`),
])
