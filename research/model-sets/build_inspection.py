"""Turn the per-pack inspections into one page, with every model drawn as the board
would draw it.

Reads the JSON that `inspect_pack.py` writes, plus the traced views themselves, and
writes an HTML page: pack by pack, the groups the shapes fall into, what was thrown
out and why, and a table that accounts for every model in the pack.

    python3 build_inspection.py packs.json > inspection.html

`packs.json` names each pack: where its inspection JSON is, where its traced views
are, and how to credit and link the pack it came from.
"""

import json
import sys
from pathlib import Path

VERDICT_CLASS = {"keep": "keep", "toss": "toss"}


def view_svg(view_path, klass):
    """One model at one angle, drawn the way the board draws it: the silhouette it
    hit-tests against, with the line art laid over the top."""
    view = json.loads(Path(view_path).read_text())
    rings, strokes = view["silhouette"], view["strokes"]
    if not rings and not strokes:
        return '<svg viewBox="0 0 1 1" class="tile empty"></svg>'
    parts = []
    for ring in rings:
        d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in ring) + " Z"
        parts.append(f'<path class="sil" d="{d}"/>')
    for stroke in strokes:
        d = "M" + " L".join(f"{x:.2f},{y:.2f}" for x, y in stroke)
        parts.append(f'<path class="ink" d="{d}"/>')
    return (f'<svg viewBox="0 0 1 1" class="tile {klass}" preserveAspectRatio="xMidYMid meet">'
            + "".join(parts) + "</svg>")


def tile(model, pack, cfg, angle=90):
    view = Path(cfg["traced"]) / model["model"] / f"{angle:03d}.json"
    klass = VERDICT_CLASS[model["verdict"]]
    label = model["model"].replace("animal-", "").replace("building-type-", "")
    return (f'<figure class="cell {klass}" title="{model["model"]} — {model["why"]}">'
            f'{view_svg(view, klass)}'
            f'<figcaption>{label}</figcaption></figure>')


def pack_section(cfg):
    data = json.loads(Path(cfg["inspection"]).read_text())
    models = data["models"]
    by_name = {m["model"]: m for m in models}
    kept = [m for m in models if m["verdict"] == "keep"]
    tossed = [m for m in models if m["verdict"] == "toss"]

    spans = {tuple(g): s for g, s in zip(map(tuple, data["groups"]), data["group_span"])}
    groups = [g for g in data["groups"] if len(g) > 1]
    grouped_names = {n for g in groups for n in g}
    live_groups = sum(1 for g in groups if sum(by_name[n]["verdict"] == "keep" for n in g) > 1)
    singles = [m for m in kept if m["model"] not in grouped_names]

    out = [f'<article class="pack" id="{cfg["id"]}">']
    out.append(f'<div class="pack-head"><h2>{cfg["title"]}</h2>'
               f'<span class="by">{cfg["creator"]} · {cfg["licence"]}</span></div>')
    out.append(f'<p class="lede">{cfg["lede"]}</p>')
    out.append(f'<figure class="preview"><img loading="lazy" src="{cfg["preview"]}" alt="{cfg["alt"]}">'
               f'<figcaption>{cfg["credit"]} — <a href="{cfg["url"]}">{cfg["url_label"]}</a></figcaption></figure>')

    out.append('<div class="tally">'
               f'<div><dt>In the pack</dt><dd>{len(models)}</dd></div>'
               f'<div><dt>Kept</dt><dd>{len(kept)}</dd></div>'
               f'<div><dt>In groups</dt><dd>{live_groups} groups, {len(grouped_names & {m["model"] for m in kept})} models</dd></div>'
               f'<div><dt>Thrown out</dt><dd>{len(tossed)}</dd></div>'
               '</div>')

    if groups:
        out.append('<h3>The groups</h3>')
        out.append(f'<p class="note">Complete linkage at {data["group_threshold"]} mean IoU: '
                   'a model joins a group only when it is that close to every model already in it. '
                   'A greyed tile is one thrown out of the group as the same shape as a member.</p>')
        out.append('<div class="groups">')
        for g in sorted(groups, key=lambda g: (-sum(by_name[n]['verdict'] == 'keep' for n in g), -len(g))):
            members = [by_name[n] for n in g]
            keeps = [m for m in members if m["verdict"] == "keep"]
            lo, hi = spans[tuple(g)]
            rng = f'{lo:.2f}–{hi:.2f}'
            out.append('<div class="group">')
            out.append(f'<div class="group-tiles">{"".join(tile(m, cfg["id"], cfg) for m in members)}</div>')
            out.append(f'<div class="group-meta"><b>{len(keeps)} kept</b> of {len(members)}<br>'
                       f'<span class="n">IoU {rng}</span></div>')
            out.append('</div>')
        out.append('</div>')

    fleet = data.get("fleet")
    if fleet:
        out.append('<h3>A twelve out of it</h3>')
        out.append('<p class="note">Picked from the survivors by the numbers alone: the twins are '
                   'the tightest four in the pack — no pair inside them looser than '
                   f'{fleet["twins_floor"]:.2f} — the loud four are the shapes least like the rest of '
                   'the pack, and the plain four sit in the middle of that same measure.</p>')
        out.append('<div class="fleet">')
        for tier in ("loud", "plain", "twins"):
            row = "".join(tile(by_name[n], cfg["id"], cfg) for n in fleet[tier])
            out.append(f'<div class="tier"><b>{tier.upper()}</b><div class="grid">{row}</div></div>')
        out.append('</div>')

    if singles:
        out.append('<h3>On their own</h3>')
        out.append('<p class="note">Nothing else in the pack comes within '
                   f'{data["group_threshold"]} of these.</p>')
        out.append('<div class="grid">' + "".join(tile(m, cfg["id"], cfg) for m in singles) + '</div>')

    if tossed:
        reasons = {}
        for m in tossed:
            why = m["why"]
            if why.startswith("the same shape"):
                key = "the same shape as something already kept"
            elif why.startswith("no silhouette"):
                key = "traced to nothing at one or more angles"
            else:
                key = why
            reasons.setdefault(key, []).append(m)
        out.append('<h3>Thrown out</h3>')
        for why, ms in sorted(reasons.items(), key=lambda kv: -len(kv[1])):
            out.append(f'<p class="note"><b>{len(ms)}</b> — {why}</p>')
            out.append('<div class="grid">' + "".join(tile(m, cfg["id"], cfg) for m in ms) + '</div>')

    out.append('<details><summary>Every model in this pack, and what became of it</summary>')
    out.append('<table><thead><tr><th>Model</th><th>Verdict</th><th>Reading</th>'
               '<th>Closest other model</th><th class="n">IoU</th></tr></thead><tbody>')
    for m in sorted(models, key=lambda m: (m["verdict"], m["model"])):
        out.append(f'<tr class="{m["verdict"]}"><td>{m["model"]}</td><td>{m["verdict"]}</td>'
                   f'<td>{m["why"]}</td><td>{m["nearest"] or "—"}</td>'
                   f'<td class="n">{m["nearest_iou"]:.2f}</td></tr>')
    out.append('</tbody></table></details>')

    if cfg.get("verdict"):
        out.append(f'<div class="cost"><p>{cfg["verdict"]}</p></div>')
    out.append('</article>')
    return "\n".join(out)


def main():
    cfg = json.loads(Path(sys.argv[1]).read_text())
    sections = "\n".join(pack_section(p) for p in cfg["packs"])
    template = Path(sys.argv[2]).read_text()
    sys.stdout.write(template.replace("<!--PACKS-->", sections)
                             .replace("<!--INTRO-->", cfg["intro"]))


if __name__ == "__main__":
    main()
