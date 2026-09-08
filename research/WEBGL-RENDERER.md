# Rendering the board in WebGL instead of baking views

Notes toward a decision, not a decision. The board can be drawn two ways: bake a
fixed set of camera angles to stroke data offline, or ship the meshes and draw them
live. This is what was measured and read about the second option.

Measurements come from the twelve-vehicle Kenney Car Kit fleet this game was built
against, on Chromium with ANGLE over desktop NVIDIA GL. Sources were retrieved and
read; the claims below distinguish measured numbers from cited ones.

---

## What the two options cost

**Measured, this fleet.**

| | payload | covers |
|---|---|---|
| baked stroke data + 1-bit prompts | 2,548 KB | 12 models × **8 fixed angles** |
| GLB files as downloaded | 2,294 KB | 12 models, any angle |
| geometry alone, uint16-quantised | **~260 KB** | 12 models, any angle |

The GLB figure is mostly scaffolding — split vertices for flat shading, normals, UVs,
JSON. The geometry that a renderer actually needs is 13,383 verts (80 KB as int16),
26,461 triangles (159 KB as uint16 indices) and 5,284 crease edges (21 KB).

The baked payload scales with **models × angles**; the mesh payload scales with
**models**. Sixteen angles would put the bake near 5 MB and leave the meshes
untouched. Continuous rotation is unreachable by baking at any size.

Per instance a car needs a `vec2` position, a `float` scale and a `float` azimuth —
16 bytes, because a fixed camera means the azimuth is a number rather than a matrix.
Seventy cars is 1.1 KB. The count on the board is free.

**Simplifying the baked strokes barely helps.** Ramer-Douglas-Peucker at four
thousandths of the frame removes only 25% of the points, because Line Art emits short
strokes — under seven points each on average — with almost nothing collinear to drop.
There is no headroom hiding in the 2D data.

## What the current 2D board costs to draw

Measured at 70 cars on an 800×800 field, Canvas2D:

| pass | ms |
|---|---|
| stroke 89,432 points | 15.2 |
| + 70 silhouette fills | 40.4 |
| + 1-bit threshold in JS | **70.2** |

Fourteen frames a second. That is fine for a board that holds still, and it is the
whole problem for a board that drifts. The equivalent GPU work — 154k triangles and a
threshold in a fragment shader — is far inside one frame.

---

## Outlines: the deciding constraint

The look to match is Blender's Line Art: occluded contour, crease and material edges.
**Interior creases carry the identity of a vehicle** — four bodies in this fleet share
a shell and differ by a roof sign or a light bar — so any technique that produces only
an outer boundary is unusable here.

| technique | interior creases | notes |
|---|---|---|
| inverted hull / backface expansion | **no** | silhouette only; a sedan and a taxi come out identical |
| precomputed sharp-edge list, depth-tested | **yes** | every crease the mesh has, exactly |
| screen-space depth + normal discontinuity | partly | misses shallow creases; fails between near-coplanar faces |
| screen-space depth + **surface ID** | partly | IDs separate surfaces normals cannot |

The two families answer different halves of the problem, and the split is not
arbitrary: **a crease is a fixed property of the mesh, a contour is view-dependent.**
An edge lies on the silhouette only while one adjacent face points at the camera and
the other away, so no precomputed list can hold the contour of a smooth form. On
faceted low-poly vehicles most silhouette edges happen also to be crease edges, which
is why the precomputed list nearly suffices on its own.

Occlusion is not a loss here. A depth-tested edge list hides what is behind, which is
what Line Art does too.

**Z-fighting between an edge and the surface it belongs to is the main hazard.**
Polygon offset on the solid prepass is the standard fix. Too much offset and lines on
back faces bleed through; too little and lines on front faces vanish.

WebGL2 has no geometry shaders, so GPU-side silhouette extraction is unavailable and
edge geometry has to be prepared on the CPU or offline.

- Omar Shehata's two implementations, depth+normal and surface ID —
  <https://github.com/OmarShehata/webgl-outlines>
- Hertzmann & Zorin, *Illustrating Smooth Surfaces*, SIGGRAPH 2000 — the foundational
  silhouette-extraction algorithm —
  <https://mrl.cs.nyu.edu/publications/illustrating-smooth/hertzmann-zorin.pdf>
- DeCarlo et al., *Suggestive Contours for Conveying Shape*, SIGGRAPH 2003, and the
  2004 temporally-coherent real-time follow-up
- Judd, Durand & Adelson, *Apparent Ridges for Line Drawing*, SIGGRAPH 2007 —
  <https://people.csail.mit.edu/tjudd/apparentLines.pdf>
- Crease extraction and depth-tested line drawing, worked example —
  <https://www.songho.ca/webgl/webgl_edge.html>

---

## Line width is a portability trap

`gl.lineWidth` above 1 is not portable. Most implementations clamp
`ALIASED_LINE_WIDTH_RANGE` to `[1, 1]`. **This machine reports `[1, 10]`**, which is
the dangerous case: thick lines look correct while developing and collapse to
hairlines for most players.

At one pixel the problem does not exist — `GL_LINES` is fine everywhere and the edge
buffer stays at 21 KB. Above one pixel every segment has to become a quad expanded in
screen space, which needs, per vertex: its own endpoint, the opposite endpoint, and a
corner sign; the shader transforms both endpoints to screen space, takes the
perpendicular, and offsets by half the width. That costs six vertices per edge instead
of two — about 500 KB across this fleet.

**Expansion and per-car instancing do not conflict, if the expansion is baked.**
Pre-expanding each model's edges to quads once, offline, leaves the corner data as
per-vertex attributes and the car transform as the only per-instance attribute — one
level of instancing, which is all WebGL2 offers. Expanding at runtime instead would
want a second level of instancing (one per edge) that the API cannot nest, forcing
index arithmetic on a flattened instance count.

For 1-bit output, **bevel joins and butt caps** are the cheap correct choice; round
joins need a fan or a texture and buy nothing once the output is thresholded.
Supersampling and morphological dilation are both wasted spend here — they buy
antialiasing, which a hard threshold throws away.

Hand-rolling the expansion is preferable to a library at this scale; the libraries
(three.js `LineSegments2`, MeshLine, `regl-gpu-lines`) carry dashing, world-space
width and transparency that a 1-bit board does not use.

- <https://github.com/mhalber/Lines> — techniques compared side by side
- <https://wwwtyro.net/2019/11/18/instanced-lines.html> — instanced expansion, worked
- <https://mattdesl.svbtle.com/drawing-lines-is-hard> — why this is harder than it looks
- <https://cesium.com/blog/2013/04/22/robust-polyline-rendering-with-webgl/>

---

## Instancing and picking

A `mat4` instance attribute eats **four** of the sixteen attribute slots; a position,
scale and angle eat three between them. Building the rotation from one float in the
vertex shader is both cheaper and standard practice, not a trick.

Instance data that changes every frame wants **two or three preallocated buffers used
round-robin** with `bufferData`. `bufferSubData` on a buffer the GPU is still reading
stalls the pipeline.

**Picking is better than free.** Write the instance ID to a second colour attachment
during the depth prepass, then read one pixel under the cursor. It is pixel-exact,
returns the topmost object without sorting, and beats raycasting hundreds of
overlapping meshes on the CPU. `readPixels` is synchronous and stalls, but a
single-pixel read on a click costs 1–2 ms and happens only on click; a 1×1 scissor
around the cursor trims the work further.

Portability notes worth keeping: read back as `RGBA`/`UNSIGNED_BYTE`, because Firefox
validates format and type pairs more strictly than Chrome; and `gl_InstanceID` must be
passed to the fragment shader with `flat`.

- <https://webgl2fundamentals.org/webgl/lessons/webgl-instanced-drawing.html>
- <https://webgl2fundamentals.org/webgl/lessons/webgl-picking.html>
- <https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/vertexAttribDivisor>

---

## Dithering: mostly a problem this board does not have

A screen-space ordered dither is pinned to the pixel grid, so a moving surface slides
underneath it and the halftone appears to crawl. It is worst during slow, constant
motion, which is exactly what a drifting board would be.

**It applies to almost none of this game.** The board is line art on paper with no
shading, so it carries no halftone at all; the only dithered image is the prompt
panel, which shows one vehicle and does not move.

**The related artifact the board does risk is line shimmer.** Hard-thresholding
antialiased hairlines on moving geometry makes strokes pop in and out as they cross
pixel boundaries. Different cause, same family, and it is the thing worth looking at
before committing to a live renderer.

If shading ever reaches the board, the fixes are known. Lucas Pope pinned Obra Dinn's
dither to a world-space cube centred on the camera, so the pattern rotates with the
world and translates with the viewer, and he preferred blue noise over a Bayer matrix
in hindsight because it survives video compression and rescaling. Surface-stable
fractal dithering is the current state of the art for anchoring a pattern to a surface
without it scaling under rotation.

An orthographic camera and rotation about one axis make surface-anchored dithering
unusually tractable: dot size stays constant, and a pattern that turns with the object
reads as correct rather than as a fault.

- Lucas Pope's devlog on Obra Dinn's dithering —
  <https://dukope.com/devlogs/obra-dinn/tig-32/>
- Rune Skovbo Johansen, Surface-Stable Fractal Dithering —
  <https://github.com/runevision/Dither3D>
- Aras Pranckevičius's port to the Playdate, with the constraints spelled out —
  <https://aras-p.info/blog/2025/02/09/Surface-Stable-Fractal-Dither-on-Playdate/>
- <https://surma.dev/things/ditherpunk/> — the concepts, at length
- <https://momentsingraphics.de/BlueNoise.html> — free blue noise textures

---

## What the spike settled

`gl-spike.html` draws the fleet from its meshes: a depth prepass, then edges depth
tested against it, `antialias` off and lines one pixel wide, so the canvas is one bit
per pixel with no threshold pass at all.

**Speed is a non-issue.** Measured with `gl.finish()` rather than the frame clock,
which is throttled whenever the page is not really on screen: 70 cars draw in 0.09 ms
and 300 cars in 0.21 ms, against 70.2 ms for the same board in Canvas2D.

**Crease edges alone are not enough, and the gap is visible rather than theoretical.**
Drawn on their own, wheels come out as broken arcs and car outlines stop wherever the
boundary crosses two panels that meet softer than the crease threshold. The fix is to
carry BOTH adjacent face normals on each edge and test them in the vertex shader: draw
where the edge is a crease, or where the two faces disagree about facing the camera.
Anything else is parked outside the clip volume for one vertex and no fragments. That
closes the wheels and the silhouettes, and it is why the line buffer cannot be
indexed — the normals belong to the edge, and shared vertices would have to disagree
about them. It costs 39,673 edges carried where 5,286 are creases.

**A screen-space silhouette pass is not needed.** The vertex-shader contour test
covers what the crease list misses, on faceted models at least.

**Most of the drawing is neither crease nor contour — it is UV seams.** Laid beside
the baked view of the same vehicle at the same angle, a renderer drawing creases and
contours produces a car with no windscreen, no side windows, no headlights, no grille,
no door seam, no tyre tread and no wheel hubs. Every one of those is dead flat: at a
crease threshold of one degree only 1,482 of the sedan's 3,048 edges qualify, and none
of the missing ones do.

The kit paints itself from a single palette image, so a windscreen is not a separate
material and not a fold in the bodywork -- it is a patch of one flat panel pointing at
a different swatch. glTF has to split the vertices around it to give them their own
texture coordinates, and that split is the only trace of it left in the geometry.
Welding, which is necessary before any fold can be read, closes those splits and takes
the detail with it.

The split cannot be found by position, because both faces sit in the same place and
agree about the edge. It shows as a **disagreement between index adjacency and
position adjacency**: by index each face believes it is on an open edge, by position
they are neighbours. Reading the seams before welding and matching them back by
position recovers them. It is what most of the ink turns out to be -- for the sedan,
1,592 seams against 375 creases -- and it is the half that tells one body from another,
which for four vehicles sharing a shell is the whole game.

With seams included the two drawings agree: pixels present in the bake and absent from
the live render fall from 3,353 to 270, and what is left is line weight rather than
missing lines.

**Line shimmer is real, and it is not a WebGL problem.** Nudging the board a fraction
of a pixel and counting the ink that changes: a quarter-pixel move relocates 28% of
the ink, half a pixel 54%, a whole pixel effectively all of it. Total ink barely
changes, so lines are not appearing and vanishing — they are landing in different
places. A one-pixel line that is never antialiased has no way to move a third of a
pixel; it stays or it jumps. Any 1-bit renderer does this, Canvas2D included, and the
current board only escapes it by holding still.

Worth knowing before motion is switched on. The levers are to snap car positions to
whole pixels, so the drawing translates rigidly instead of reshuffling; to accept it;
or to give up the hard threshold on the lines.

## What is still unmeasured

- What polygon offset a low-poly vehicle wants before lines bleed or vanish. The
  spike exposes it as a slider and it has not been swept.
- Whether seam detection holds up on a model that is not painted from a palette
  atlas. A model with real materials or real textures splits its vertices along
  different lines, and may not split them at all.
- Whether pixel-snapping actually removes the shimmer, or only converts it into
  visible stepping.
- Whether rotation shimmers worse than translation. Turning resamples the whole
  drawing rather than sliding it.
