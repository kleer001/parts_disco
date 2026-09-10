"""Drop rig, keep shape: bake an animated model down to the one mesh the tracer wants."""
import bpy, sys
argv = sys.argv[sys.argv.index('--')+1:]
src, dst = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        continue
    o.modifiers.clear()
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB')
print('DERIGGED', dst)
