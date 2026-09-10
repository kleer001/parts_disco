# Model sets the yard could hold

Candidate replacements and additions for the fleet: free model sets built from one
anatomy, with members close enough to confuse. `index.html` is the write-up — open it
through `./run.sh` rather than as a `file://` path, since it hotlinks previews from the
sites that publish the models.

## What is here

| | |
|---|---|
| `index.html` | The sets, what fleet each would make, and what each costs. |
| `silhouette_iou.py` | How alike two traced views are: intersection over union of their silhouettes. |
| `derig.py` | Drops the armature off a rigged model so the tracer can see its mesh. |
| `measurements.tsv` | Every pair quoted in the write-up, per angle and as a mean. |

## Reproducing a number

Trace a model the way the game does, then compare two of them:

```sh
blender -b --factory-startup -P tools/model_views/render_views.py -- \
    --model boat-speed-a.glb --out views/ --angles 4
python3 research/model-sets/silhouette_iou.py views/ 0,90,180,270 boat-speed-a:boat-speed-b
```

A rigged model goes through `derig.py` first, or every view comes back empty:

```sh
blender -b --factory-startup -P research/model-sets/derig.py -- fish.glb fish-flat.glb
```

IoU of 1.00 means the board cannot separate the two at all. The fleet in the game runs
0.64 to 0.86, which is the band the write-up judges candidates against.
