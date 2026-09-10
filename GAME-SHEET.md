# GAME-SHEET — parts disco

## Fantasy

You are the person who can tell a taxi from a police car from a plain sedan at a
glance, in a yard where a hundred and twenty of them are parked on top of each other.

## Core loop

You are shown one vehicle — solid, from an angle you will not find in the yard — and
you click every copy of it in the pile; then the pile gets denser, the vehicles get
smaller, and the lookalikes get closer.

## Why it's fun in 30 seconds

The first yard is ten big vehicles that look nothing like each other, and you clear it
in seconds and feel fast. Then the panel asks for a sedan, and four of the twelve
vehicles in the yard are the same car underneath.

## Genre & audience

Seek-and-find / visual discrimination puzzle. For people who play hidden-object games
and observation puzzlers, and for anyone who enjoys a hard perceptual task that has a
clean, checkable answer.

## Look & sound

One-bit line renders of vehicles on flat inks, laid on ruled paper and set in VT323 —
a printed parts catalogue rather than a screen. The ground is coloured as a map, so no
two touching regions ever share an ink. A disco loop plays under it and ducks out of
the way of every sound the board makes.

---

# The design answers

## What the player learns by repeating the loop
*Owned by the Critic.*

At minute one you are matching silhouettes: a tractor is not a fire truck. By the
second hour you are reading roof lines, window counts and wheel arches, because four
of the twelve vehicles — sedan, sports sedan, taxi, police — are the same body, and
head-on the only thing between them is a roof sign. The path keeps producing the test
rather than repeating the level: the twins tier arrives at stage 9, is the *whole*
fleet by stage 14, and the last three stages shrink the vehicles to 19% and cut the
ground from three inks to one, so the colour that separated shapes stops helping.

## Which uncertainty this game sells
*Owned by the Shipper.*

Perceptual uncertainty — "is that the shape?" — not outcome uncertainty. Nothing is
hidden, nothing is off screen, and no click is resolved by a roll: the whole board is
visible from the first frame and the rule never changes. The seed decides which
vehicles are dealt and where they land, and that is all it decides. Everything a
player is uncertain about is something they get better at, which is the kind worth
selling.

## The mechanic that produces the promised feeling
*Owned by the Critic.*

The promise is that telling things apart is hard and that getting it right feels like
expertise. Two rules produce it. First, the fleet holds deliberate near-twins that
share a body, and the prompt shows the target at an angle that does not appear in the
yard — so you cannot match a picture to a picture, you have to identify a vehicle.
Second, the ground is four-colour mapped: adjacent regions are guaranteed to differ,
which means a colour tells you where a boundary is and never what a thing is. The
second rule exists to take away the shortcut the first rule would otherwise leave.

Rule → behaviour → feeling: no shared angle and no colour cue → the player stops
scanning for a whole shape and starts checking one discriminating feature → the click
that lands is a small act of expertise rather than a lucky match.

## What the action feels like, and where the latency is
*Owned by the Superfan.*

Input is read on `pointerdown` and the hit test runs on that same frame, against
polygon containment rather than a bounding box. On a find, the game clock freezes for
the hit stop, the vehicle grows, shakes, strobes green and settles into an ink it was
not wearing; a Shepard tone sounds one rung above the last find and never runs out of
ladder. A wrong vehicle answers with a square wave that falls in pitch, a wash, and a
unit off the meter. Measured: a still board is 0.22ms a frame, one vehicle at its
pulse peak 5.8ms, a level change 6.5ms mean and 12.1ms worst, which lands under the
wipe.

**This answer is not yet earned.** Those are latencies, not feel, and the standard
asks for something felt rather than reasoned about. Nobody but the author has played
this game.

## The failure state, and what losing teaches
*Owned by the Shipper.*

Ten units of damage, carried across stages rather than reset per board. Only a wrong
*vehicle* charges them: bare ground and an already-found car are free, because a click
on nothing is not the mistake the game is about. The price falls geometrically, from a
whole unit at stage 1 to a quarter at stage 16. A full meter frosts the yard and
offers the same stage again from a different deal, so what you lost was the run and
what you get back is not the board you had just memorised.

What a loss teaches is "I guessed instead of checking," which is legible because every
charge came from a vehicle the player chose. **The known hole:** the cost does not
scale with how many vehicles a stage asks for, and that count swings from 2 to 33, so
two stages at the same point on the path charge the same for very different amounts of
clicking. Untested.

## Lineage — what this descends from
*Owned by the Archivist.*

- **Seek-and-find in a dense static scene** — *Where's Wally?* (Martin Handford, 1987)
  and *I Spy* (Jean Marzollo and Walter Wick, 1992) in print; *Hidden Folks* (Adriaan
  de Jongh and Sylvain Tegroeg, 15 February 2017) as the game that showed the form
  works with a hand-drawn one-bit scene and no timer.
- **The coloured ground** — the four colour theorem (Appel and Haken, 1976): any map
  can be coloured with four colours so no two adjacent regions match. `paint.js`
  implements the constraint, which is what makes colour useless as an identity cue.
- **In this studio** — Glyph Tracer and Treasure Trash. The undo question is the one
  they disagree on: Glyph Tracer ships none and Treasure Trash unlimited, and neither
  is the easier game.

**Not claimed:** the printed-catalogue look has no single named ancestor. It came from
the one-bit renders and the halftone they forced, not from a game this one was copying.
