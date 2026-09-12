"""Write the fleet's entry in `data/groups.json` from the game's own tiering.

`src/levels.js` owns how the shipped fleet is tiered -- `TIERS` is what the whole
difficulty path hangs off, and the game reads it synchronously at load, so it cannot
come from a file the game has to fetch. The bench and the model tools need the same
fleet as data, and a second hand-written copy of twelve names is a copy that goes stale
the first time a vehicle moves tier.

So the copy is generated. Node imports the real module rather than any parsing of it,
which means this cannot disagree with what the game does.

    python3 tools/sync_fleet.py          # rewrite the entry
    python3 tools/sync_fleet.py --check  # fail if it is stale, and change nothing

Run it after editing `TIERS`.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
READ_TIERS = "import { TIERS } from './src/levels.js'; console.log(JSON.stringify(TIERS));"


def tiers_of_the_game():
    """`TIERS` as the game itself sees it."""
    out = subprocess.run(['node', '--input-type=module', '-e', READ_TIERS],
                         cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def main():
    groups_path = ROOT / 'data/groups.json'
    groups = json.loads(groups_path.read_text())
    fleet = next(g for g in groups['groups'] if g['id'] == 'fleet')

    tiers = tiers_of_the_game()
    members = tiers['loud'] + tiers['plain'] + tiers['twins']
    stale = fleet.get('tiers') != tiers or fleet.get('members') != members

    if '--check' in sys.argv:
        print('stale: the fleet group does not match src/levels.js' if stale
              else 'in step with src/levels.js')
        raise SystemExit(1 if stale else 0)

    fleet['tiers'] = tiers
    fleet['members'] = members
    groups_path.write_text(json.dumps(groups, indent=1))
    print('rewritten from src/levels.js' if stale else 'already in step; nothing changed')


if __name__ == '__main__':
    main()
