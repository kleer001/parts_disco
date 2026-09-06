"""Turn patent specification text into a reference-numeral -> part-name table.

A patent's detailed description names each part beside its numeral in the open
("the distributor cap 42") and repeats that pairing many times over. Any single
occurrence is unreliable -- the grammar sometimes puts the wrong words next to the
number -- so every occurrence votes and the winner is the most specific name that
still carries most of the mentions.

Stdlib only. Offline tooling: nothing here ships with the game.
"""

import math
import re
from collections import Counter, defaultdict

# --- tuning ---------------------------------------------------------------------

MAX_PHRASE_WORDS = 5

# A phrase wins if it appears in at least this share of its numeral's mentions.
# Below 0.5 the specific-but-rare variants ("ignition distributor cap", said once)
# start beating the name the draftsman actually used throughout.
MIN_SUPPORT = 0.5

# A figure with fewer distinct numerals than this is a diagram, not a board.
MIN_NUMERALS_FOR_BOARD = 12

# Words that end a noun phrase when scanning backwards from a numeral.
BOUNDARY_WORDS = frozenset("""
a an the said and or of in on at to for with from by as is are was were be been
being that which while when where into onto upon over under between through about
having has have includes include included including comprising comprises comprise
disposed mounted secured attached connected coupled formed provided extends
extending positioned located arranged shown illustrated according respectively
also further thereof therein thereon thereto wherein such each any all both
""".split())

# Stripped from the front of a phrase once it has been read.
LEAD_STRIP = frozenset("""
first second third fourth fifth sixth seventh eighth ninth tenth
said the a an one another other respective same single preferred present
""".split())

# A numeral introduced by one of these is a figure or a citation, not a part.
CITATION_CUES = frozenset(
    "fig figs figure figures no nos pat patent claim claims table step steps embodiment".split()
)

# A numeral trailed by one of these is a measurement, not a part.
UNIT_WORDS = frozenset("""
mm cm m km in inch inches ft feet degrees degree deg percent psi rpm bar
volt volts v hz khz mhz ms sec secs second seconds minute minutes hour hours
""".split())

_TOKEN_RE = re.compile(r"[A-Za-z]+|\d+[a-z]?|[.,;:()\[\]]")
_NUMERAL_RE = re.compile(r"^(\d+)[a-z]?$")
_GROUPED_NUMBER_RE = re.compile(r"\b\d{1,3}(?:,\d{3})+\b")


# --- extraction -----------------------------------------------------------------


def tokenize(text):
    """Words, reference numerals and punctuation, in order."""
    # Comma-grouped numbers are patent and application numbers. Dropping them whole
    # stops the tokenizer splitting "4,123,456" into three plausible-looking numerals.
    return _TOKEN_RE.findall(_GROUPED_NUMBER_RE.sub(" ", text))


def _as_numeral(token):
    match = _NUMERAL_RE.match(token)
    return match.group(1) if match else None


def _is_citation(tokens, i):
    for prev in reversed(tokens[max(0, i - 3):i]):
        if prev in ".,;:()[]":
            continue
        return prev.lower().rstrip(".") in CITATION_CUES
    return False


def _is_measurement(tokens, i):
    if i + 1 >= len(tokens):
        return False
    return tokens[i + 1].lower() in UNIT_WORDS


def _phrase_before(tokens, i):
    words = []
    for token in reversed(tokens[max(0, i - MAX_PHRASE_WORDS - 2):i]):
        lowered = token.lower()
        if not token.isalpha() or lowered in BOUNDARY_WORDS:
            break
        words.append(lowered)
        if len(words) == MAX_PHRASE_WORDS:
            break
    words.reverse()
    while words and words[0] in LEAD_STRIP:
        words.pop(0)
    return " ".join(words) if words else None


def _winner(phrases):
    """The longest phrase carried by at least MIN_SUPPORT of the mentions.

    Every phrase also votes for its own suffixes, so "ignition distributor cap"
    supports "distributor cap" and "cap" too. That lets a name assembled from
    varying-length mentions win over any one of its spellings.
    """
    support = Counter()
    for phrase, count in phrases.items():
        words = phrase.split()
        for start in range(len(words)):
            support[" ".join(words[start:])] += count

    total = sum(phrases.values())
    threshold = max(1, math.ceil(total * MIN_SUPPORT))
    eligible = [p for p, c in support.items() if c >= threshold]
    if not eligible:
        return None, 0
    # Longest wins; then best supported; then alphabetical, so runs are repeatable.
    best = max(eligible, key=lambda p: (len(p.split()), support[p], p))
    return best, support[best]


def extract_labels(text):
    """Map each reference numeral to the part name the specification gives it.

    Returns {numeral: {"name", "votes", "mentions", "confidence"}}, keyed by the
    numeral as a string and ordered numerically.
    """
    tokens = tokenize(text)
    phrases_by_numeral = defaultdict(Counter)
    mentions = Counter()

    for i, token in enumerate(tokens):
        numeral = _as_numeral(token)
        if numeral is None:
            continue
        if _is_citation(tokens, i) or _is_measurement(tokens, i):
            continue
        mentions[numeral] += 1
        phrase = _phrase_before(tokens, i)
        if phrase:
            phrases_by_numeral[numeral][phrase] += 1

    labels = {}
    for numeral, phrases in phrases_by_numeral.items():
        name, votes = _winner(phrases)
        if name is None:
            continue
        labels[numeral] = {
            "name": name,
            "votes": votes,
            "mentions": mentions[numeral],
            "confidence": round(votes / mentions[numeral], 3),
        }
    return {k: labels[k] for k in sorted(labels, key=int)}


def screen(labels):
    """Is this figure dense enough to be a board? Reason is for the run log."""
    count = len(labels)
    if count < MIN_NUMERALS_FOR_BOARD:
        return False, f"{count} named parts, want {MIN_NUMERALS_FOR_BOARD}"
    return True, f"{count} named parts"
