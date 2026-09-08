"""Export a model as the three buffers a live renderer wants: verts, triangles, creases.

Run headless:

    blender -b --factory-startup -P export_mesh.py -- --model car.glb --out geo/

The companion to render_views.py, which bakes a fixed ring of camera angles instead.
This one bakes no angles at all: it hands over the mesh and lets the renderer choose
the camera, which is the whole reason to prefer it once the board starts moving.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


# Faces meeting at a softer angle than this are the model's own faceting rather than
# a feature of the vehicle. Matches the crease threshold render_views.py gives Line
# Art, so the two pipelines draw the same set of lines.
CREASE_ANGLE = 75.0

# Vertices closer than this are the same vertex. glTF splits them per face to get flat
# shading, which leaves no two faces sharing an edge -- and an edge with one face
# looks like a boundary, so without this every edge reads as a crease.
WELD = 1e-4


def parse_args(argv):
    parser = argparse.ArgumentParser(prog="export_mesh")
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--crease", type=float, default=CREASE_ANGLE)
    return parser.parse_args(argv)


def load(path):
    """Import a glTF, join it to one mesh, and weld the split vertices back together."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"no mesh in {path}")  # boundary
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=WELD)
    bpy.ops.object.mode_set(mode="OBJECT")
    return bpy.context.view_layer.objects.active


def normalize(model):
    """Centre on the origin and scale the longest axis to 2 units.

    The same framing render_views.py uses, so a model drawn live sits at the size its
    baked views were drawn at and the two can be compared directly.
    """
    box = [model.matrix_world @ Vector(corner) for corner in model.bound_box]
    lo = Vector((min(p.x for p in box), min(p.y for p in box), min(p.z for p in box)))
    hi = Vector((max(p.x for p in box), max(p.y for p in box), max(p.z for p in box)))
    span = hi - lo

    model.location -= (lo + hi) / 2
    bpy.ops.object.transform_apply(location=True)
    model.scale = (2.0 / max(span), ) * 3
    bpy.ops.object.transform_apply(scale=True)


def lines(mesh, threshold, positions):
    """Every edge that could ever be drawn, with what the renderer needs to decide.

    Two kinds of line make a drawing of a solid, and only one of them is a property
    of the mesh. A CREASE is fixed: two faces fold sharply and the line is there from
    every angle. A CONTOUR is not: an edge lies on the outline only while one of its
    faces turns toward the camera and the other away, so it moves as the model turns
    and no list can hold it.

    So both adjacent face normals ride along on the edge, and the renderer tests them
    each frame. Edges that are neither crease nor contour this frame are thrown away
    in the vertex shader. Shipping only the creases leaves the outline full of holes
    wherever a car's boundary crosses panels that meet softly.

    Written out per vertex rather than indexed, because the normals belong to the
    edge and an index buffer would have to share them between edges that meet.
    """
    normals = {}
    for face in mesh.polygons:
        for key in face.edge_keys:
            normals.setdefault(key, []).append(face.normal.copy())

    limit = math.radians(threshold)
    out = {"positions": [], "normalA": [], "normalB": [], "crease": []}
    for (a, b), faces in normals.items():
        # A boundary edge has nothing on the other side to turn away, so it is always
        # drawn and its two normals are the same one.
        first = faces[0]
        second = faces[1] if len(faces) == 2 else faces[0]
        crease = 1.0 if len(faces) == 1 or first.angle(second) > limit else 0.0
        for index in (a, b):
            out["positions"] += positions[index * 3:index * 3 + 3]
            out["normalA"] += [round(v, 5) for v in yup(first)]
            out["normalB"] += [round(v, 5) for v in yup(second)]
            out["crease"].append(crease)
    return out


def yup(vector):
    """Blender is Z-up; a renderer expects Y-up."""
    return (vector.x, vector.z, -vector.y)


def main(argv):
    args = parse_args(argv)
    model = load(args.model)
    normalize(model)
    mesh = model.data
    mesh.calc_loop_triangles()

    # Converting here keeps the axis swap out of the shader, where it would be
    # repeated per vertex per frame.
    positions = []
    for vertex in mesh.vertices:
        positions += [round(v, 5) for v in yup(vertex.co)]

    triangles = []
    for tri in mesh.loop_triangles:
        triangles += list(tri.vertices)

    edges = lines(mesh, args.crease, positions)

    args.out.mkdir(parents=True, exist_ok=True)
    path = args.out / f"{args.model.stem}.json"
    path.write_text(json.dumps({
        "model": args.model.stem,
        "positions": positions,
        "triangles": triangles,
        "lines": edges,
    }))
    drawn = sum(edges["crease"]) / 2
    print(f"EXPORTED {args.model.stem} verts {len(positions) // 3} "
          f"tris {len(triangles) // 3} edges {len(edges['crease']) // 2} "
          f"(creases {drawn:.0f}) -> {path}")


if __name__ == "__main__":
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
