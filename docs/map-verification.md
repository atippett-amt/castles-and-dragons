# Map adjacency verification

The build plan asked for the `holds.json` graph to be checked against the map art
before Phase 1 — in particular the bottom-edge Littleville–Whiteoak border. This
records what was actually found by inspecting `map.png` (1023 × 1537).

## Method

Region fills were sampled and the art was cropped and magnified at four junctions:
the bottom edge, the eastern tan mass, the southwest greens, and the south lake
shore. Regions are distinguished by fill colour and by the scalloped border stroke
the artist drew around each one.

## Result: confirmed as originally written

| Edge | Type | Note |
|---|---|---|
| Littleville–Whiteoak | land | **The flagged unknown — it is real.** Littleville's dark-green fill meets Whiteoak's lighter gold along the bottom of the map. |
| Florence–Sheffield | bridge | Bridge icon visible on the shore. |
| Florence–Muscle Shoals | bridge | Bridge icon visible. |
| Killen–Ford City | bridge | Bridge icon visible. |
| Killen–Muscle Shoals | water | Killen's southern tip faces Muscle Shoals directly across the lake. |
| Muscle Shoals–Ford City | land | They meet along a scalloped border running south from the lake shore. |
| Ford City–Whiteoak | land | These are two distinct regions, not one. Ford City is the darker tan lobe; Whiteoak is the lighter gold that wraps around its south and west. |
| Sheffield–Muscle Shoals, Sheffield–White House Springs, Muscle Shoals–White House Springs, Muscle Shoals–Littleville, White House Springs–Littleville | land | All visible in the southwest crop. |
| The four northern land edges | land | Unchanged. |

## Result: one edge added

**`muscle_shoals`–`whiteoak` (land).** Whiteoak's lighter gold fill reaches west
far enough to touch Muscle Shoals along the stretch immediately south of Ford
City. The original graph omitted this, which left Whiteoak as a dead-end corner
reachable only through Ford City or Littleville.

## Result: a second water edge added (resolved)

The map originally defined exactly **one** `water` edge (Killen–Muscle Shoals),
which left dragons' defining ability — ignoring the lake — nearly inert, with a
single crossing on the eastern flank and none in the centre or west.

**`florence`–`ford_city` (water)** was added after checking the art. Just east of
the Florence–Muscle Shoals bridge the lake pinches to a narrow neck: Florence's
southeastern shore and Ford City's northwestern shore face each other across it,
at roughly `x 0.545, y 0.47` — the same point where the Muscle Shoals / Ford City
land border meets the waterline. The crossing is real, not invented to balance
the graph.

Wilson Lake now has **five** crossings in total: three bridges open to everyone,
and two open-water routes only dragons can use.

## Still worth watching

Sheffield and White House Springs sit at the western end with no water route at
all, so the far west remains a land-only pocket. That is probably correct — the
lake genuinely narrows to a river there — but if the west ever feels
strategically inert once dragons are flying in Phase 5, this is the place to
look.
