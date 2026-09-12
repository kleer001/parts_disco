# Model sets the yard could hold

Free model sets built from one anatomy, with members close enough to confuse — and what
is actually inside the ones worth downloading. Two pages, both hotlinking previews from
the sites that publish the models, so serve them rather than opening a `file://` path.

| | |
|---|---|
| `index.html` | The survey: thirteen candidate sets, the fleet each would make, what each costs. |
| `inspection.html` | Seven packs traced model by model — the groups, the duplicates, the discards, and a table that accounts for every model. |

## The tools

| | |
|---|---|
| `silhouette_iou.py` | How alike two traced views are: intersection over union of their silhouettes. |
| `inspect_pack.py` | Sorts a whole traced pack into groups and gives every model a verdict. |
| `build_inspection.py` | Draws the inspections as a page, every model as the board would draw it. |
| `derig.py` | Drops the armature off a rigged model so the tracer can see its mesh. |
| `packs.json` | Which packs `build_inspection.py` writes up, and how to credit each one. |
| `measurements.tsv` | The pairs quoted in the survey, per angle and as a mean. |

## Working a pack over

Trace it the way the game does, sort it, then draw it:

```sh
for f in models/*.glb; do
    blender -b --factory-startup -P tools/model_views/render_views.py -- \
        --model "$f" --out traced/ --angles 4
done
python3 research/model-sets/inspect_pack.py traced/ --props "wheel,debris" > pack.json
python3 research/model-sets/build_inspection.py packs.json inspection-template.html > inspection.html
```

`--props` names the prefixes that are not members of the set — the wheels and karts in a
car kit, the fishing rods in a fish pack. Everything else is decided by measurement.

A rigged model goes through `derig.py` first, or every view comes back empty:

```sh
blender -b --factory-startup -P research/model-sets/derig.py -- fish.glb fish-flat.glb
```

## Reading the numbers

IoU of 1.00 means the board cannot separate the two at all. The fleet in the game runs
0.64 to 0.86, and its vehicles fill 17% to 45% of their own frame — the bands and
thresholds in `inspect_pack.py` are set against those two facts.
