# parts disco

A browser game raised in **Trace ROM Studio**. Vanilla JS, ES modules, no build step,
runs straight in the browser.

This file is the index. It says what this game is, what always applies, and where the
studio keeps everything this game has not needed yet. A game starts with almost
nothing on purpose — apparatus arrives when the game is ready for it, not at birth.

## Run

- `./run.sh [port]` — no-cache dev server, scans upward for a free port. Open the URL
  it prints. Never open `index.html` as a `file://` path: ES modules do not load.

## Where this game is

Five labels, not gates. You move between them by noticing you already have.

- **Sketch** — `SPEC-SHEET.md` and an idea. Nothing plays yet.
- **Prototype** — the vertical slice. One loop, placeholder everything, only you.
- **Alpha** — content going in while the shape still moves.
- **Beta** — content-complete, no known blockers, played by someone who isn't you.
- **Release** — the gate, then the store page.

**When something is moving and it is game-shaped, go back to the studio.** That is
the moment the design shelf is about, and it is the only moment it is cheap. A game
that reaches alpha without it has skipped the rung, not passed it.

## The shelves

The studio holds each rung's apparatus until this game grafts it. Nothing is copied
in advance. Read the shelf's own README before grafting — several bring conventions
that belong in this file, and one brings a step that is not a file.

| Shelf | Holds | Graft when |
|---|---|---|
| `shelves/L1` | `DESIGN.md` — what makes a loop good. Read, not grafted. | Shaping the game, and again when the slice plays |
| `shelves/L2` | `GAME-SHEET.md`, the persona panel, `PLAYTEST.md` | Something plays and you can hand it to someone |
| `shelves/L3` | `src/`, `tests/`, `package.json`, `test.yml` | You are writing real game code |
| `shelves/L4` | `publishing/`, `fonts/`, `pages.yml`, `RELEASE-CHECKLIST.md`, the copy skills | Content-complete and heading for a store page |

The panel is **cast for this game** — its four lenses take their questions from what
this game promises and what it descends from. A generic panel cannot catch a game
breaking a promise it was never told about.

The publishing tools stay in the studio and run against this game from there. They
are developer-machine tools; nothing in CI and no player ever needs them.

## Conventions that always apply

- `camelCase` functions and variables, `PascalCase` classes, `UPPER_SNAKE` constants.
- Validate at boundaries; trust internal functions; **fail loudly** — one path, no
  silent fallbacks.
- Comments carry the **why**. The what is on the line below.
- **A decision with a rejected alternative gets written down, in two places.**
  `DECISIONS.md` is the terse index — one line-pair per ruling, grouped by area,
  undated, overwritten when the ruling changes; read it before proposing anything
  structural. `DECISIONS-JOURNAL.md` is the dated corpus: append-only, never pruned,
  because the superseded reasoning is what shows how the thinking moved. The trigger is
  the rejected alternative — something was weighed, it lost, and a later session could
  reasonably re-propose it. Not every choice. The loser is the payload, `Threaded:`
  names the code that enforces the call, and reasoning moves between the two files
  rather than being deleted.
- **Nothing written in words decides what the code does** — not a comment, not a
  doc, not a test's name, not a commit message, not a line of this file. A test name
  describes what the code did the day it was written, so a red test is the expected
  result of changing a rule rather than a veto on it. Never quote any of it back at
  the owner as a reason a change can't be made.
- Atomic conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- **Never fabricate** a fact, source, quote, or date — in code, docs, or copy. "I
  don't know" is an answer.
- **Write findings as costs, not as rules.** A measurement or a passing state
  written as "never", "always", "cannot" or "keep X out" reads back next session as
  policy, and gets obeyed. Pre-alpha, almost everything is provisional, so almost
  every such sentence is a roadbump nobody chose. Say what was measured and what
  changing it would cost; keep the imperative for what the owner decided. If a
  future session could cite the sentence to refuse the owner, it is a rule you
  invented — rewrite it as a cost.

## Writing game code

- **Seeded randomness.** `mulberry32` for every draw in game logic; never
  `Math.random()`. A run must reproduce from its seed, which is what makes a bug
  reportable and a test possible.
- **Layered rendering.** Reach for a new layer before reaching into the loop. The
  contract is one object — `{ name, draw(ctx, frame) }` — added with
  `compositor.add(...)`.
- **A test asserts what the code implements.** What merely follows from two rules
  meeting is an observation, and a locked observation makes a design change fail the
  build for no reason.

## Building it

**DRY, SOLID, YAGNI, KISS** — roughly in the order they bite.

- **Minimum code that solves the problem.** No unrequested features, abstractions,
  flexibility or configurability. No defensive code for impossible scenarios. If 200
  lines could be 50, it should be 50.
- **One source of truth for every rule and constant.** If a value or a piece of logic
  appears twice, hoist it — copy-paste is a bug waiting to drift. **A sentence
  describing what the code does is a copy**: `src/` is the description, the tests pin
  it, the data files carry the tuning. Before writing a sentence, ask whether editing
  the code could make it false. If it could, point at the code instead.
- **Separate code from data.** Logic in `src/`; levels, tables, tuning constants and
  content live as data, never hard-coded in functions. Retune without editing logic.
- **One path, no fallbacks.** No primary-with-a-rescue, no "if missing, create it",
  no retry loops, no second strategy for robustness. A fallback hides the bug that
  would have told you what was wrong.
- **Surgical changes.** Touch only what the task needs. Don't improve adjacent code,
  don't refactor what isn't broken, don't reformat in passing. Every changed line
  traces to the request.
- **SOLID, pragmatically** — a small game, not an enterprise app. One responsibility
  per module (`rng`, `board`, `render`, `audio`, `input`); extend by adding data or
  modules rather than editing the core loop; variants honor one contract so callers
  never special-case which they got; small focused surfaces; and core logic never
  reaches for the DOM, canvas or audio directly — pass those in at the boundary,
  which is what keeps the logic pure, deterministic and testable.

## The studio tie

`.trace_rom_studio.toml` records the studio version this game was born from and where
the studio lives. To pull conventions forward:

```sh
python3 <studio>/scripts/check_updates.py .
```

It prints the directives between this game's pin and the studio's current `VERSION`.
For each: read the cited studio files, compare to this game, propose changes to the
user — **never auto-apply**. `--mark-read` advances the pin, and only after the
directives are actually resolved. An advanced pin with unadopted directives is worse
than a stale one: it is a lie the tooling believes.

Refusing a directive is allowed — every entry carries a **Skip if** for exactly that.
Put the refusal in a commit message, or the next session re-litigates it.

If this game solves something the studio got wrong, that is the most valuable thing
the studio can be told.

## The panel on disk

A lens **definition** belongs on disk — who this game's four are, and what each was
cast to ask. A lens's **verdict** does not. Never write a persona's words to a file,
and never cite one in a doc, comment, test, or commit message. What survives a panel
is a decision you author in your own voice, defended on its merits: an invented
character's opinion, written down, reads back next session as a specification.
