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
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view


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


def write_view(path, model, azimuth, strokes):
    path.write_text(json.dumps({
        "model": model,
        "azimuth": azimuth,
        "strokes": [[[round(x, 5), round(y, 5)] for x, y in s] for s in strokes],
    }))


def render_png(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


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
        write_view(out / f"{stem}.json", args.model.stem, int(round(azimuth)), strokes)
        # Hide the line art for the shaded pass: the prompt is the solid car, and
        # the whole point of the asymmetry is that it carries no outline.
        gp.hide_render = True
        render_png(out / f"{stem}.png")
        gp.hide_render = False

    print(f"RENDERED {args.model.stem} {args.angles} views -> {out}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
