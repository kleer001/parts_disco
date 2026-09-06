# parts disco

Twenty car parts drift across each other like a screenprint pulled out of register.
A panel names one. Find it before it slides back under the pile.

A browser game raised in [Trace ROM Studio](https://github.com/kleer001/trace_rom_studio).
Vanilla JS, ES modules, no build step.

## Run

```sh
./run.sh          # serves http://localhost:8000, no-cache
./run.sh 9000     # pick a port; it scans upward if that one is busy
```

Open the URL it prints. Don't open `index.html` from the filesystem — ES modules,
`fetch` and relative paths all behave differently under `file://`.

## Layout

- `index.html` — the page. `styles.css` — the look: ink on paper, not phosphor.
- `run.sh` — the dev server.
- `CLAUDE.md` — what this game is, what always applies, and which studio shelf holds
  what it hasn't needed yet.
- `SPEC-SHEET.md` — a pre-code sketch. Deleted once the slice plays; if it isn't
  here, that already happened.
- `DECISIONS.md` — what was ruled and what was rejected, terse and undated.
  `DECISIONS-JOURNAL.md` — the dated why behind each, append-only.
- `.trace_rom_studio.toml` — the studio version this game descends from, and where
  to find that studio.
- `LICENSE` — MIT.

That is the whole repo at birth. Tests, a renderer, a store page and a release gate
all exist, in the studio, and arrive when this game reaches the rung that wants them.
`CLAUDE.md` says which shelf holds which, and when.

## Next

1. Sketch the first build in `SPEC-SHEET.md` — an afternoon, not a document.
2. Build the smallest thing that plays. Days, not weeks.
3. Go back to the studio the moment something is moving and game-shaped.
