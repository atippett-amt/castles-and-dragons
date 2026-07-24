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

## Open question, deliberately not changed

The map defines exactly **one** `water` edge (Killen–Muscle Shoals). Dragons are
designed to "ignore the lake entirely," but with a single open-water route that
ability is nearly inert — the eastern flank has one, the western half of the lake
has none. A second water edge (Florence–Ford City is the geographically natural
candidate) would make dragon flanking matter on both sides. Left alone for now;
revisit after the map renders and the graph is visible.
