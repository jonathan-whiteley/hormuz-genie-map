# Hormuz Map App Redesign: Genie-First Map

**Date:** 2026-10-21
**Status:** Approved (spec and mockup, 2026-10-21). Mockup states: resting, Genie answer, tour step.
**Replaces:** the screen and interaction design in `2026-10-09-hormuz-map-app-design.md`. That
spec's data loading, queries, deploy model and brand rules still apply.

## 1. Why

The first version works but does not demo well. The user's verdict: too much going on in the UI,
too many dots and lines on the map, and a clunky Genie sidebar whose question, answer and sample
questions stack in a way no chat app does. The Genie-to-map interaction is the weakest part,
yet it is the thing the demo should sell.

Success:
- A first screen that is calm and says one thing: Hormuz traffic collapsed.
- A demo built on one repeatable move: ask a question, and the answer lands on the map.
- A Genie panel that behaves like a chat app.
- Layers the presenter can toggle without Genie.
- A guided tour that exists but is optional.

## 2. Decisions (confirmed with the user)

| # | Decision | Choice |
|---|---|---|
| 1 | Hero | Genie. Answers add or highlight things on the map |
| 2 | Layers | Toggleable on their own, independent of Genie |
| 3 | Tour | Optional mode started from a button; not a tab, not the landing view |
| 4 | Resting map | Chokepoints only, labeled and colored by percent of normal; everything else off |
| 5 | Layout | Map plus a right-hand chat sidebar (option A); no tabs |
| 6 | Data | Same pipelines, tables, queries and Genie space; app layer only, plus tighter space instructions |

## 3. Screen

```
+ The Invisible Strait  Hormuz 4% of normal . 5 of 6 lanes disrupted  [badge] [Tour] [How it works] +
| +- Layers ---------+                                  | Ask the map               |
| | [x] Chokepoints  |                                  |                           |
| | [ ] Ports        |              map                 |  thread (scrolls)         |
| | [ ] Supply lanes |                                  |                           |
| | [ ] AIS coverage |              [Showing: ... x]    |                           |
| +------------------+                    [legend]      |  [starter chips]          |
| ----------o------------------------- Feb ... Oct      | [ Ask a question...   > ] |
+-------------------------------------------------------+---------------------------+
```

- **Top bar:**
  - Databricks logo and title.
  - Two headline numbers from the latest data: Hormuz 7-day transits as a percent of the
    pre-war baseline, and the number of the six demo lanes whose status is Disrupted (for
    example "5 of 6 lanes disrupted").
  - The existing freshness badge, then the Tour and How it works buttons.
- **Map (left, fills the remaining width):**
  - The floating Layers card (top left).
  - The answer pill (section 5.3).
  - A compact legend (bottom right).
  - A slim date slider along the bottom edge, with the war-event ticks.
- **Chat (right, 400 px, full height):** section 5.
- **Resting camera:** frames Suez, Bab el-Mandeb and Hormuz. The Cape of Good Hope is off screen
  at rest and shows when panned to or when an answer includes it.
- **Removed:**
  - the Story and Explore tabs and pages, and the story card
  - the left rail and its KPI tiles
  - the vessel-type picker: base layers show total traffic, and Genie answers by vessel type
  - the lane recommendation panel and sparkline: Genie answers recommendation questions from
    `gold_lane_recommendation`
- **Kept:** the error banner for missing tables, the freshness badge, the "Genie not configured"
  state (now shown inside the chat panel).

## 4. Layers and styling

**Palette:**
- One sequential ramp for every percent-of-normal value, from Lava 600 (0%) to Navy 900 (100% or
  more).
- Gray only for context (outlines, dimmed marks).
- Lava with a white halo is reserved for Genie answers, so an answer never looks like base data.

**The four toggles:**

| Layer | Default | Marks | Labels |
|---|---|---|---|
| Chokepoints | On | The four chokepoints in `chokepoints_daily` (Hormuz, Bab el-Mandeb, Suez, Cape of Good Hope); circles sized by baseline transits, colored by 7-day percent of baseline | Always: name and percent |
| Ports | Off | Region ports with a pre-war baseline of at least 1 call a day; small circles on the ramp. Ports below that threshold are not drawn | On hover, or always at zoom 6 and above |
| Supply lanes | Off | The six demo lanes, one thin curved line each, colored by lane status; lanes that share a route are drawn as one bundle with a count | On hover |
| AIS coverage | Off | The five sampling-region outlines, each with one label ("Gulf: 22% visible"); H3 cells only at zoom 5 and above | Region label always |

**Other rules:**
- The date slider drives every base layer. Genie answers are not filtered by it.
- The legend lists only the layers that are on, plus the answer swatch while an answer shows. At
  rest it is one line: the ramp and "percent of pre-war traffic".
- Clicking a chokepoint or port opens a popover with its name, 7-day calls, baseline and percent,
  and an "Ask about <name>" button that fills the chat input. Hover shows only the name and
  percent.

## 5. Chat and answers on the map

### 5.1 Thread

- The panel reads top to bottom like a chat app: header ("Ask the map", plus New chat), the
  scrolling thread, then the input pinned to the bottom. Enter sends; Shift+Enter adds a line.
- User messages are right-aligned bubbles. Genie replies are left-aligned and contain, in order:
  - the text answer, rendered as Markdown
  - a map chip: "On the map: 7 ports" (absent when nothing is mappable)
  - a collapsed "Table (7 rows)" disclosure
  - a collapsed "Show query" disclosure with the SQL
- **Empty state:** one intro line and four starter chips. Each starter must return a mappable
  result; this is verified against the live space before the starters are fixed (section 7).
- **Follow-ups:** Genie's suggested follow-ups show as chips under the latest reply only. Chips
  under older replies are removed.
- **Pending:** a typing indicator with Genie's status text ("Generating SQL", "Running query").
  The input is disabled while a question is in flight.
- **Errors:** the reply bubble shows the error with a Retry action. Retry re-sends the same
  question without adding a duplicate user bubble.
- **Conversation:** follow-ups continue the same Genie conversation. New chat clears the thread,
  the answer layer and the conversation id.

### 5.2 What maps

An answer maps from its query result rows. Detection order (first match wins; coordinates
come first because Genie often returns an `h3_res7` column next to `lat`/`lon`, and places
come before lanes because port answers often carry a `lane_id` column too):
1. lat/lon column pairs (existing rules): points.
2. H3 cell ids (existing `toH3Hex` rules): cells.
3. **New fallback:** a name column whose values match port or chokepoint names in the
   loaded reference data. Points are placed at those coordinates.
4. `lane_id` values: those lanes.

Notes:
- Matching is case-insensitive and tolerant of the PortWatch "Strait"/"Canal" suffixes.
- Unmatched names are ignored, and the map chip counts only the matched names.
- Rows beyond `MAX_LAYER_ROWS` are not drawn; the table still shows them.
- The Genie space instructions gain one rule: when the answer is about ports or chokepoints,
  include the `port` or `chokepoint` name and `lat`, `lon`.

### 5.3 How an answer shows

- One answer is on the map at a time.
- When a reply arrives with mappable rows:
  - its marks draw on top in the answer style
  - base layers dim to about 35% opacity
  - the camera fits the answer's bounds
  - up to 12 features carry a label (name and the first numeric value); more than 12 show
    labels on hover only
- A pill on the map reads "Showing: <question, truncated>" with a close button. Closing it
  removes the answer layer and restores the base layers and camera.
- Clicking the map chip of an older reply puts that reply's answer back on the map.
- Hovering a table row highlights its mark; clicking a mark highlights and scrolls to its row.
- A reply with nothing mappable leaves the current map as it is.

## 6. Tour and How it works

- **Tour** starts a five-step walkthrough reusing the current story beats:
  1. exposure
  2. the strait closes
  3. where traffic went
  4. lanes with no way around
  5. what you cannot see
- **Each step:**
  - sets the layers, date and camera
  - shows a caption in a slim bar along the bottom of the map with Back, Next and Exit
  - has an "Ask Genie this" button that sends the step's question to the chat, so the
    answer lands on the map
- **Step copy:** step text reuses the existing data-driven scene copy, shortened to two
  sentences.
- **Exit and end:** exiting, or finishing step 5, restores the layers, date and camera that
  were in place before the tour started.
- **How it works** opens the existing Architecture diagram in a modal, with its zoom, fit and
  export controls.

## 7. Build and testing

**Code changes (inside `app/client/src`):**
- **Keep:** `data/` loading and types, `genie/genieClient.ts`, `genie/genieLayer.ts`
  (extended), `map/MapView.tsx`, `architecture/`, `shell/freshness.ts`, the error banner,
  `explore/dates.ts`.
- **Rebuild:**
  - the shell (App, TopBar)
  - the chat panel (thread, messages, input, starters)
  - the Genie store (thread state, active answer, conversation id)
  - `map/layers.ts` (styling and filters above)
  - the legend
  - the layers card and the date slider
  - the tour (steps, caption bar)
- **Delete:** `story/` pages and card (the scene copy moves into the tour), `explore/` pages and
  LeftRail, `decisions/` UI, `data/kpi.ts` tiles that nothing uses any more, and their tests.
- **Space instructions:** add the name and lat/lon rule to `genie/space_config.py` and rerun
  `genie.build_space`.

**Unit tests (vitest):**
- name-to-coordinate matching, including suffix tolerance and unmatched names
- detection order and the answer layer spec
- the ports baseline filter, the lane bundling, and AIS cells by zoom
- the chat thread reducer: send, pending, reply, error, retry without a duplicate, follow-up
  chips only on the latest reply, New chat
- the active answer: latest wins, older replay, clear
- tour enter and exit restoring state

**Live checks:**
- Each starter question is run against the real space through `/api/genie/default/messages`,
  and its result must map before it becomes a starter.
- Headless Playwright screenshots (bearer token on the app origin only), reviewed before the
  work is called done:
  - the resting state
  - each starter answer on the map
  - one table-row hover
  - each tour step
  - How it works

**Ship:**
- Work on local branch `feat/elegant-map`.
- Deploy to the DEFAULT workspace only after `bundle plan` shows no delete or recreate,
  passing the four vars.
- Squash-merge to `main` after a history scan, as with the first version; the branch is not
  pushed.
- README screenshots and the tabs section are updated to match.

## 8. Out of scope

- New data sources, pipeline or table changes (other than the Genie space instructions).
- Multiple simultaneous answers on the map, or saved conversations.
- Mobile layout. The target is a laptop or projector at 1440 by 900 or wider.
