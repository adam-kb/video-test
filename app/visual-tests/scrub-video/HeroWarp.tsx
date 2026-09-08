"use client"

import { HERO_IN, HERO_OUT } from "app/visual-tests/scrub-video/bendConfig"
import gsap, { SplitText } from "gsap/all"
import { css, f, styled } from "library/styled"
import { useAnimation } from "library/useAnimation"
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from "ogl"
import { useEffect, useRef, useState } from "react"

gsap.registerPlugin(SplitText)

/** how far the copy rises, in fractions of the plane */
const RISE = 0.16

/**
 * the wave. the copy lands and ONE crest passes down through the whole block —
 * the surface it sits on is a sheet snapping in wind, not a struck bell. a
 * single hump travelling, rather than a train of oscillations: the copy above
 * and below the crest stays flat, and only the band the crest is crossing lifts.
 *
 * the whole block shares one surface, so a word does not deform independently
 * of the word beside it. every glyph on the same row moves together.
 */

/** peak lift of the crest, in fractions of the plane */
const RIPPLE = 0.045

/**
 * how tight the crest is. higher = a narrow ridge crossing, lower = a broad
 * swell that lifts most of the block at once
 */
const RIPPLE_SHARP = 3.2

/** how fast the crest travels top to bottom. lower = you see it travel */
const RIPPLE_SPEED = 1.5

/** how much of the clip the pass occupies, in progress */
const RIPPLE_WINDOW = 0.09

/**
 * the opening copy drawn into webgl so the whole block can warp as one surface.
 *
 * the svg-filter version distorts per pixel from a noise field, which reads as
 * crumpled cloth, and it can't do this: a wave that travels. this moves the
 * *geometry* the text is painted on, so the block can be struck at the top and
 * ring downward through itself.
 *
 * the text is rasterised from the real dom: measured line boxes, computed fonts
 * and colours. nothing about the layout is reimplemented here, so the canvas
 * matches what the browser would have painted.
 */
export default function HeroWarp() {
	const host = useRef<HTMLDivElement>(null)
	const source = useRef<HTMLDivElement>(null)
	const [fontsReady, setFontsReady] = useState(false)

	useEffect(() => {
		let live = true
		document.fonts.ready.then(() => live && setFontsReady(true))
		return () => {
			live = false
		}
	}, [])

	useAnimation(
		() => {
			if (!fontsReady) return

			const el = host.current
			const copy = source.current
			const track = el?.closest("[data-track]")
			if (!el || !copy) return

			// real line boxes from the real layout, then paint them one for one
			const split = SplitText.create(copy.querySelectorAll("[data-rise]"), {
				type: "lines",
			})
			const lines = [...split.lines, ...copy.querySelectorAll("[data-rise-block]")] as HTMLElement[]

			const dpr = Math.min(window.devicePixelRatio, 2)
			const canvas = document.createElement("canvas")
			const ctx = canvas.getContext("2d")

			const paint = () => {
				const box = copy.getBoundingClientRect()
				if (!ctx || !box.width || !box.height) return

				canvas.width = Math.round(box.width * dpr)
				canvas.height = Math.round(box.height * dpr)
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
				ctx.clearRect(0, 0, box.width, box.height)
				ctx.textBaseline = "alphabetic"

				for (const line of lines) {
					const rect = line.getBoundingClientRect()
					const style = getComputedStyle(line)
					const text = line.textContent
					if (!text) continue

					ctx.font = style.font || `${style.fontSize} ${style.fontFamily}`
					ctx.fillStyle = style.color

					// fontBoundingBoxAscent puts the baseline where the browser put it;
					// without it every line sits a few px high
					const metrics = ctx.measureText(text)
					const ascent = metrics.fontBoundingBoxAscent || Number.parseFloat(style.fontSize) * 0.8

					ctx.fillText(text, rect.left - box.left, rect.top - box.top + ascent)
				}
			}

			paint()
			split.revert()

			const renderer = new Renderer({ alpha: true, dpr, antialias: false })
			const gl = renderer.gl
			el.appendChild(gl.canvas)

			const camera = new Camera(gl, { fov: 35 })
			camera.position.z = 5

			const scene = new Transform()
			const texture = new Texture(gl, {
				image: canvas,
				generateMipmaps: true,
				minFilter: gl.LINEAR_MIPMAP_LINEAR,
				magFilter: gl.LINEAR,
				anisotropy: 8,
				premultiplyAlpha: true,
			})

			const program = new Program(gl, {
				transparent: true,
				uniforms: {
					tMap: { value: texture },
					uAmount: { value: 1 },
					uFade: { value: 0 },
					uRise: { value: RISE },
					uImpact: { value: 0 },
					uRipple: { value: RIPPLE },
					uRipSharp: { value: RIPPLE_SHARP },
					uRipSpeed: { value: RIPPLE_SPEED },
				},
				vertex: /* glsl */ `
					precision highp float;

					attribute vec3 position;
					attribute vec2 uv;

					uniform mat4 modelViewMatrix;
					uniform mat4 projectionMatrix;
					uniform float uAmount;
					uniform float uRise;
					uniform float uImpact;
					uniform float uRipple;
					uniform float uRipSharp;
					uniform float uRipSpeed;

					varying vec2 vUv;

					void main() {
						vec3 p = position;

						// rising into place
						p.y -= uRise * uAmount;

						// one crest crossing the sheet. depth is 0 at the top and 1 at the
						// bottom, so the crest's centre slides down as uImpact grows.
						float depth = 1.0 - uv.y;
						float centre = uImpact * uRipSpeed - depth;

						// a single hump rather than a sine train: away from the crest this
						// falls to nothing, so only the band being crossed is lifted
						float crest = exp(-centre * centre * uRipSharp * uRipSharp);

						// fades out once the crest has run off the bottom
						float alive = 1.0 - smoothstep(1.0, 1.6, uImpact * uRipSpeed);

						p.y += crest * uRipple * alive;
						// the sheet shortens slightly where it lifts, the way real cloth does
						p.x += crest * uRipple * 0.22 * (uv.x - 0.5) * 2.0 * alive;

						vUv = uv;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
					}
				`,
				fragment: /* glsl */ `
					precision highp float;

					uniform sampler2D tMap;
					uniform float uFade;

					varying vec2 vUv;

					void main() {
						// premultiplied, so scale the whole texel
						gl_FragColor = texture2D(tMap, vUv) * uFade;
					}
				`,
			})
			program.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

			const mesh = new Mesh(gl, {
				geometry: new Plane(gl, { widthSegments: 40, heightSegments: 40 }),
				program,
			})
			mesh.setParent(scene)

			const resize = () => {
				const width = el.clientWidth
				const height = el.clientHeight
				if (!width || !height) return

				renderer.setSize(width, height)
				camera.perspective({ aspect: width / height })

				const worldHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
				mesh.scale.set(worldHeight * (width / height), worldHeight, 1)

				paint()
				texture.needsUpdate = true
			}

			resize()
			const observer = new ResizeObserver(resize)
			observer.observe(el)

			const state = { progress: 0 }
			if (track)
				gsap.to(state, {
					progress: 1,
					ease: "none",
					scrollTrigger: {
						trigger: track,
						start: "top top",
						end: "bottom bottom",
						scrub: true,
					},
				})
			else gsap.to(state, { progress: 1, duration: 3, ease: "none" })

			let drawn = -1
			const render = () => {
				if (state.progress === drawn) return
				drawn = state.progress

				// warped and invisible before it arrives, flat and solid at rest,
				// then warped away again on the way out
				const rise = gsap.utils.clamp(
					0,
					1,
					(state.progress - HERO_IN.start) / (HERO_IN.end - HERO_IN.start),
				)
				const exit = gsap.utils.clamp(
					0,
					1,
					(state.progress - HERO_OUT.start) / (HERO_OUT.end - HERO_OUT.start),
				)

				const eased = 1 - (1 - rise) ** 3
				program.uniforms.uAmount.value = 1 - eased + exit
				program.uniforms.uFade.value = eased * (1 - exit)
				program.uniforms.uRise.value = RISE * (1 - eased) - RISE * exit

				// the reverb starts the moment the copy lands and decays from there
				program.uniforms.uImpact.value = Math.max(0, (state.progress - HERO_IN.end) / RIPPLE_WINDOW)

				renderer.render({ scene, camera })
			}
			gsap.ticker.add(render)

			return () => {
				gsap.ticker.remove(render)
				observer.disconnect()
				gl.canvas.remove()
				gl.getExtension("WEBGL_lose_context")?.loseContext()
			}
		},
		[fontsReady],
		{ recreateOnResize: true },
	)

	return (
		<Overlay>
			<Surface ref={host} />
			{/* the real copy stays in the dom for layout, selection and screen
			    readers; the canvas is what's actually seen */}
			<Source ref={source} aria-hidden={false}>
				<Heading data-rise>
					GO 1 brings
					<br />
					private AI on-prem
				</Heading>
				<Body data-rise>
					Run go.os inside your institution, with local inference, governed access, and no public
					cloud dependency.
				</Body>
				<Cta data-rise-block>Try The Go1</Cta>
			</Source>
		</Overlay>
	)
}

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

const Surface = styled("div", [
	f.unresponsive(css`
		position: absolute;
		inset: 0;

		& canvas {
			display: block;
		}
	`),
])

const Source = styled("div", [
	f.responsive(css`
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 28px;
		/* laid out so it can be measured, but never painted */
		opacity: 0;
	`),
])

const Heading = styled("h1", [
	f.responsive(css`
		font-size: 40px;
		font-weight: 600;
		line-height: 1.15;
		letter-spacing: -0.02em;
		margin: 0;
		color: #fff;
	`),
])

const Body = styled("p", [
	f.responsive(css`
		font-size: 18px;
		line-height: 1.5;
		margin: 0;
		max-width: 340px;
		color: #b8bac4;
	`),
])

const Cta = styled("div", [
	f.responsive(css`
		font-size: 18px;
		padding: 16px 32px;
		color: #fff;
	`),
])
