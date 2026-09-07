"""Render one model as a ring of outline views, plus a shaded view for the prompt.

Run headless:

    blender -b --factory-startup -P render_views.py -- --model car.glb --out views/

Orthographic on purpose. Under perspective the same model at the same angle is a
different shape depending on how far away it sits, and the board needs a view to be
a function of the angle alone -- otherwise two impressions of one car disagree and
the player is asked to match something the renderer never promised.
"""

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view


# An 8x8 ordered dither. Ordered rather than error-diffused: a regular screen is a
# halftone and error diffusion is noise, and the board is meant to read as a
# screenprint. It also compresses far better -- noise has no runs in it.
BAYER8 = np.array([
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
], dtype=np.float32) / 64.0

# Rec. 709 luma, to flatten the shaded view to one channel before screening it.
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# The eight neighbours of a pixel, clockwise from due north. Used to walk a
# silhouette's edge.
NEIGHBOURS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]

# The matte is traced at this resolution rather than the render's. The outline it
# produces is simplified straight afterwards, so tracing finer only makes points
# for the simplifier to throw away.
MATTE_SIZE = 256

# Specks this small are the odd stray polygon a wing mirror throws, not a part of
# the vehicle worth filling.
MIN_REGION = 40

# How far a traced outline may stray from the pixels it came from, as a fraction of
# the frame. A silhouette is a fill, so a point that moves half a pixel changes
# nothing anyone can see.
SIMPLIFY = 0.004


# The ring the board's views are taken from. Kept shallow: a steep camera looks down
# on a roof, and a roof is the one part of a car that carries no identity.
DEFAULTS = {
    "angles": 8,
    "elevation": 18.0,
    "resolution": 512,
    # Padding around the model's bounding sphere, as a fraction. Enough that a long
    # truck at three-quarter view does not clip its own corners.
    "fit": 1.15,
}


def parse_args(argv):
    parser = argparse.ArgumentParser(prog="render_views")
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--angles", type=int, default=DEFAULTS["angles"])
    parser.add_argument("--elevation", type=float, default=DEFAULTS["elevation"])
    parser.add_argument("--resolution", type=int, default=DEFAULTS["resolution"])
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path):
    """Import a glTF and return its meshes, joined into one object at the origin.

    Joined because Line Art draws a contour around every separate object, and a car
    assembled from a body and four wheels would come back with the wheels outlined
    through the bodywork.
    """
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"no mesh in {path}")  # boundary

    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    model = bpy.context.view_layer.objects.active

    # Bake the import's transform down so the mesh's own bounds are the real ones.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return model


def normalize(model):
    """Centre the model on the origin and scale its longest axis to 2 units.

    Every model arrives at whatever size its author left it. Normalizing here means
    one camera framing serves the whole fleet, and it is also what makes a view's
    coordinates comparable between two different cars.
    """
    box = [model.matrix_world @ Vector(corner) for corner in model.bound_box]
    lo = Vector((min(p.x for p in box), min(p.y for p in box), min(p.z for p in box)))
    hi = Vector((max(p.x for p in box), max(p.y for p in box), max(p.z for p in box)))
    span = hi - lo
    longest = max(span.x, span.y, span.z)

    model.location -= (lo + hi) / 2
    bpy.ops.object.transform_apply(location=True)
    model.scale = (2.0 / longest,) * 3
    bpy.ops.object.transform_apply(scale=True)
    return max((2.0 / longest) * s for s in span)


def setup_camera(fit_span):
    """An orthographic camera aimed at the origin, framed to hold the model."""
    data = bpy.data.cameras.new("view")
    data.type = "ORTHO"
    data.ortho_scale = fit_span * DEFAULTS["fit"]
    camera = bpy.data.objects.new("view", data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera

    target = bpy.data.objects.new("target", None)
    bpy.context.scene.collection.objects.link(target)
    # Constrain rather than compute the rotation: one aiming rule, no trigonometry
    # to get subtly wrong at the poles.
    track = camera.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    return camera


def place_camera(camera, azimuth_deg, elevation_deg, distance=10.0):
    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    camera.location = (
        distance * math.cos(el) * math.sin(az),
        -distance * math.cos(el) * math.cos(az),
        distance * math.sin(el),
    )


def setup_lineart():
    """A Grease Pencil object whose strokes are the scene's line art."""
    bpy.ops.object.gpencil_add(type="LINEART_SCENE")
    gp = bpy.context.view_layer.objects.active
    lineart = gp.grease_pencil_modifiers[0]
    lineart.use_contour = True
    lineart.use_crease = True
    lineart.use_material = True
    lineart.use_intersection = True
    # Creases softer than this are the model's own faceting, not a feature of the car.
    lineart.crease_threshold = math.radians(75)
    return gp


def setup_render(resolution):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    # One frame. A bake walks the scene's frame range, and at the default 250 it
    # returns the same view 250 times over.
    scene.frame_start = scene.frame_end = scene.frame_current = 1
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.film_transparent = True
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "SINGLE"
    shading.single_color = (0.55, 0.55, 0.55)
    shading.show_cavity = True


def trace_view(gp, camera, scene):
    """Bake the line art at this camera and return its strokes in view coordinates.

    Projected here rather than through Blender's Grease Pencil SVG exporter: that
    exporter lays the drawing out in a space of its own, and the result does not
    agree with what the camera renders. Projecting the baked points directly is
    both the shorter path and the one whose output can be checked against the
    shaded render of the same angle.

    @returns strokes as lists of [x, y] in 0..1, y down.
    """
    bpy.context.view_layer.objects.active = gp
    for obj in scene.objects:
        obj.select_set(obj is gp)
    bpy.ops.object.lineart_bake_strokes()

    strokes = []
    to_world = gp.matrix_world
    for layer in gp.data.layers:
        for frame in layer.frames:
            for stroke in frame.strokes:
                points = []
                for point in stroke.points:
                    at = world_to_camera_view(scene, camera, to_world @ point.co)
                    points.append([at.x, 1.0 - at.y])  # y down, as a canvas wants it
                if len(points) > 1:
                    strokes.append(points)
    bpy.ops.object.lineart_clear()
    return strokes


def write_view(path, model, azimuth, strokes, rings):
    path.write_text(json.dumps({
        "model": model,
        "azimuth": azimuth,
        "strokes": [[[round(x, 5), round(y, 5)] for x, y in s] for s in strokes],
        "silhouette": rings,
    }))


def regions(mask):
    """Every solid region in a binary mask, as its pixels' topmost-leftmost start."""
    height, width = mask.shape
    seen = np.zeros_like(mask)
    starts = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            size = 0
            while stack:
                cy, cx = stack.pop()
                size += 1
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if size >= MIN_REGION:
                starts.append((y, x))
    return starts


def walk_edge(mask, start):
    """Moore-neighbour trace: walk a region's edge and come back to where it began."""
    height, width = mask.shape
    solid = lambda p: 0 <= p[0] < height and 0 <= p[1] < width and mask[p[0], p[1]]

    ring = [start]
    current = start
    # The scan reached this pixel travelling left to right, so the pixel to its left
    # is empty -- which is where the sweep starts from.
    previous = (start[0], start[1] - 1)
    for _ in range(4 * mask.size):
        back = NEIGHBOURS.index((previous[0] - current[0], previous[1] - current[1]))
        step = None
        for k in range(1, 9):
            direction = (back + k) % 8
            candidate = (current[0] + NEIGHBOURS[direction][0],
                         current[1] + NEIGHBOURS[direction][1])
            if solid(candidate):
                step = candidate
                previous = (current[0] + NEIGHBOURS[(direction - 1) % 8][0],
                            current[1] + NEIGHBOURS[(direction - 1) % 8][1])
                break
        if step is None or step == start:
            break
        ring.append(step)
        current = step
    return ring


def simplify(points, tolerance):
    """Ramer-Douglas-Peucker. Drops points that lie on the line their neighbours make."""
    if len(points) < 3:
        return points
    first, last = points[0], points[-1]
    dx, dy = last[0] - first[0], last[1] - first[1]
    span = math.hypot(dx, dy)

    worst, index = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if span == 0:
            gap = math.hypot(px - first[0], py - first[1])
        else:
            gap = abs(dy * (px - first[0]) - dx * (py - first[1])) / span
        if gap > worst:
            worst, index = gap, i

    if worst <= tolerance:
        return [first, last]
    return (simplify(points[:index + 1], tolerance)[:-1]
            + simplify(points[index:], tolerance))


def silhouette(rgba):
    """The view's outline, as closed rings in the same 0..1 coordinates as the strokes.

    Taken from the shaded render's own alpha rather than from a pass of its own: the
    render is already made against nothing, so where it is opaque is exactly where
    the vehicle is. Filling loops of line art instead -- which is what a renderer has
    to do without this -- guesses at the body from the faces that happen to be
    outlined, and a car with a gap in its creases leaks.
    """
    height, width = rgba.shape[0], rgba.shape[1]
    step = max(1, height // MATTE_SIZE)
    mask = rgba[::step, ::step, 3] > 0.5
    rows, cols = mask.shape

    rings = []
    for start in regions(mask):
        ring = walk_edge(mask, start)
        if len(ring) < 3:
            continue
        # Pixel centres, in the same 0..1 frame the strokes are written in.
        points = [((x + 0.5) / cols, (y + 0.5) / rows) for y, x in ring]
        points.append(points[0])
        rings.append([[round(x, 5), round(y, 5)]
                      for x, y in simplify(points, SIMPLIFY)])
    return rings


def screen(rgba):
    """Composite the shaded view over paper and threshold it against the dither."""
    lit = rgba[..., :3] * rgba[..., 3:4] + (1.0 - rgba[..., 3:4])
    grey = lit @ LUMA
    height, width = grey.shape
    tile = np.tile(BAYER8, (height // 8 + 1, width // 8 + 1))[:height, :width]
    return grey > tile


def write_bilevel_png(path, mask):
    """Write a 1-bit greyscale PNG. True is paper, False is ink.

    By hand because Blender writes eight bits a channel at the least, and a
    screened view carries exactly one bit a pixel -- the other seven store a
    gradient that is no longer there.
    """
    height, width = mask.shape
    raw = b"".join(b"\x00" + row.tobytes() for row in np.packbits(mask, axis=1))

    def chunk(tag, body):
        return (struct.pack(">I", len(body)) + tag + body
                + struct.pack(">I", zlib.crc32(tag + body)))

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 1, 0, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b""))


def render_png(path):
    """Render the shaded view, store it screened to one bit, and hand back its pixels."""
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)

    image = bpy.data.images.load(str(path))
    # Non-Color: the stored values are wanted as they are. Pulled through an sRGB
    # transform first, the screen dithers against the wrong tones and the view
    # comes out flat.
    image.colorspace_settings.name = "Non-Color"
    width, height = image.size
    rgba = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)[::-1]
    bpy.data.images.remove(image)
    write_bilevel_png(path, screen(rgba))
    return rgba


def main(argv):
    args = parse_args(argv)
    clear_scene()
    model = import_model(args.model)
    span = normalize(model)
    setup_render(args.resolution)
    camera = setup_camera(span)
    gp = setup_lineart()

    out = args.out / args.model.stem
    out.mkdir(parents=True, exist_ok=True)
    step = 360.0 / args.angles
    for i in range(args.angles):
        azimuth = i * step
        place_camera(camera, azimuth, args.elevation)
        bpy.context.view_layer.update()
        stem = f"{int(round(azimuth)):03d}"
        strokes = trace_view(gp, camera, bpy.context.scene)
        # Hide the line art for the shaded pass: the prompt is the solid car, and
        # the whole point of the asymmetry is that it carries no outline. Hiding it
        # is also what leaves the render's alpha as a clean matte of the vehicle.
        gp.hide_render = True
        rgba = render_png(out / f"{stem}.png")
        gp.hide_render = False
        write_view(out / f"{stem}.json", args.model.stem, int(round(azimuth)),
                   strokes, silhouette(rgba))

    print(f"RENDERED {args.model.stem} {args.angles} views -> {out}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
