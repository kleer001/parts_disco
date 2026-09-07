# model_views

Turns a 3D model into the two things the board needs from it: a ring of **outline
views** as stroke data, and a **shaded render** of each angle for the prompt panel.

Offline, and run by hand. Nothing here ships; its output does.

```sh
blender -b --factory-startup -P render_views.py -- \
    --model car.glb --out views/ --angles 8
```

Writes `views/<model>/<azimuth>.json` and `views/<model>/<azimuth>.png`.

## What it does

- **Joins the model into one mesh.** Line Art draws a contour around every separate
  object, so a car assembled from a body and four wheels comes back with each wheel
  outlined straight through the bodywork.
- **Normalizes** it to a 2-unit longest axis, centred on the origin, so one camera
  framing serves any model and two cars' views are comparable.
- **Orbits an orthographic camera** at a shallow elevation. Orthographic because the
  board needs a view to be a function of the angle alone; under perspective the same
  car at the same angle is a different shape depending on its distance.
- **Traces** each angle with a scene Line Art modifier and **projects the baked
  strokes through the camera itself**, straight to JSON.
- **Renders** each angle shaded with the line art hidden, then **screens it down
  to one bit** through an ordered dither and writes the PNG by hand.
- **Traces the silhouette** off that render's own alpha and simplifies it to a
  closed ring.

## Two things that fail quietly

**Blender's Grease Pencil SVG exporter does not agree with the camera.** Line Art
places its strokes in one space and `wm.gpencil_export_svg` lays them out in
another, so the exported drawing is the model projected twice — recognisably a car,
recognisably not the view that was asked for, and identical in bytes whether the
strokes are baked first or not. Projecting the baked points with
`world_to_camera_view` is the shorter path *and* the checkable one: the traced
outline can be laid against the shaded render of the same angle, and they either
line up or they do not.

**A bake walks the scene's frame range.** At Blender's default of 250 frames every
view comes back as 250 identical copies of itself — the stroke *count* is 250× off
while the drawing looks perfectly correct, so it is invisible until something
downstream measures it. The frame range is pinned to a single frame before baking.

## Output

Two files an angle. The outline is vector and the shaded view is not, because they
are asked different questions: the board scales its outlines with the canvas and
hit-tests against their geometry, while the prompt panel only ever shows its render
at one size.

```json
{"model": "sedan", "azimuth": 45,
 "strokes": [[[0.31, 0.62], [0.34, 0.59]], ...],
 "silhouette": [[[0.28, 0.61], [0.31, 0.55], ...]]}
```

`silhouette` is the outline of the vehicle as closed rings, in the same
coordinates. It costs no render of its own: the shaded pass is already made
against nothing, so where it came back opaque is exactly where the vehicle is.
A board that instead fills the loops of the line art -- which is all there is
without this -- guesses the body from whichever faces happen to be outlined, and
leaks wherever a crease stops short. The ring is traced at a coarser resolution
than the render and simplified straight after, because a fill has no detail to
lose: a point that moves half a pixel changes nothing anyone can see.

Coordinates are `0..1` across the camera frame with **y down**, which is the
convention a canvas wants. Strokes are unsimplified: they carry every point Line Art
emitted, collinear runs included.

The PNG is **1-bit greyscale**, screened with an 8x8 ordered dither. Ordered rather
than error-diffused: a regular screen is a halftone where diffusion is noise, and
noise has no runs for the compressor to find. Measured over twelve bodies at eight
angles, the shaded views come to 249KB against 19.7MB at eight bits a channel, with
the shading still legible — the tonal information in a Workbench render survives one
bit a pixel almost intact.

Blender writes eight bits a channel at the least, so the file is encoded here from
`numpy.packbits` and `zlib`. That is the whole reason this tool needs no dependency
beyond Blender, which bundles numpy.

## Models

Any glTF. The fleet this was built against is Kenney's [Car
Kit](https://kenney.nl/assets/car-kit) (CC0) — around twenty vehicle bodies, several
of which share a shell and differ only in trim.
