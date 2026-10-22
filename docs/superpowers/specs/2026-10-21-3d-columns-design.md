# 3D Vessel Columns and Playback: Design

**Date:** 2026-10-21
**Status:** Design approved in conversation; written spec pending user review.
**Builds on:** `2026-10-21-elegant-map-design.md` (Genie-first screen). That spec still applies
except where this one changes it.

## 1. Why

The user's verdict on the shipped redesign: a time-series answer such as "What is the monthly
trend of vessel transits through the Strait of Hormuz since the war began?" collapses to one
static dot, so the trend is invisible on the map. A flat circle also understates how much the
count changed. The user asked for:

- 3D markers whose height is the vessel count at a chokepoint or port;
- heights that rise and fall over time with a play button;
- the same playback when Genie answers a time-series question.

Success:
- The Hormuz collapse is visible as motion: a tall column in February that drops in March.
- Any time-series answer about places plays on the map with no extra clicks.
- The resting map stays calm: the four chokepoints, now as short columns.

## 2. Decisions (confirmed with the user)

| # | Decision | Choice |
|---|---|---|
| 1 | Marker | Extruded 3D column per chokepoint and port; height = vessel count |
| 2 | Time | A play button animates heights over the 2026 timeline |
| 3 | Genie | Time-series answers play automatically on arrival |
| 4 | Data | PortWatch daily counts (no new source in this spec; vessel-level history is a separate research track) |

## 3. Base map in 3D

- **Camera:**
  - The map is pitched to 45 degrees by default and can be rotated (right-drag or ctrl-drag).
  - The navigation control gains the compass so the reader can reset bearing and pitch.
  - Bounds fits (resting view, answers, tour step 5) keep working. MapLibre fits top-down, then the
    pitch is applied, so the fit padding gets extra room at the top (verified in screenshots).
- **Chokepoints and ports:**
  - Each one becomes a deck.gl `ColumnLayer` column (extruded, flat-shaded, a few facets so it reads as a round
    column) at its location.
  - Height = the 7-day average daily vessel count on the selected date (total across vessel
    types). The elevation scale is one global constant per kind (meters per vessel a day), chosen
    so that Hormuz at its pre-war level (about 68 a day) is clearly the tallest column in the
    resting view. Chokepoints and ports share the scale, so heights compare.
  - Color stays on the percent-of-normal ramp (Lava at 0%, Navy at 100% or more). Hover and
    click behave as today (tooltip, popover).
  - A column never drops below a minimum visible height, so a closed strait still reads as a
    place: a short Lava stub, not nothing.
  - Labels stay flat text above the column top, with name and percent, as today.
- **Other layers** (lanes, AIS coverage) stay flat on the ground.
- **Dimming while an answer shows** applies to the columns as it does today.

## 4. Play button

- **Control:** a play/pause button sits at the left end of the date slider, before the date readout.
- **Playing:**
  - Steps the selected date forward one day at a time, at about one month of data every 2
    seconds.
  - Starts from 2026-01-01, or from the current date when that is not the end.
  - Stops at the latest date.
  - Pressing play at the end restarts from 2026-01-01.
- **Interrupting:** dragging the slider pauses playback; starting the tour pauses playback.
- **Smoothing:** heights and colors transition smoothly between frames (deck.gl attribute
  transitions on elevation and fill color, about the length of one frame), so the motion reads
  as growth, not flicker.
- **Motion preferences:** respects `prefers-reduced-motion`: no height transitions, and the step
  size becomes one week.

## 5. Time-series answers

**Detection.** An answer is a time series when it has a date-like column (a day, week, month or
timestamp, as today's `dateColumn` recognises) and its rows map to places (points by lat/lon or by
place name). Monthly values like `2026-02` count as the first day of the month.

**Model.** Each place gets a series of `{date, value}` frames instead of a single merged row:
- value = the count-like numeric column: prefer `*_7d_avg`, then `n_total`, then columns with
  "calls" or "transits" in the name, then the first numeric non-percent column;
- the percent column (if any) drives the color.

The existing merge-to-latest (one feature per place) remains the static label and table-link
fallback.

**Drawing:**
- Lava columns at each place, with a white halo disc at the base, the same answer identity as
  today.
- Heights use the same scale as the base columns, so an answer column and the base map compare
  directly.
- The label shows the frame's date and value (for example "Hormuz · Mar 2026 · 10.3 a day").

**Playback:**
- When the answer arrives it plays through its own dates once, at about one frame per second for
  monthly data (scaled so the whole series takes 5 to 12 seconds).
- It stops on the latest frame.
- The "Showing" pill gains play/pause and the current frame date.
- The date slider follows the answer's frame while it plays, so the base map and the answer stay
  in step.
- Dragging the slider takes over: the answer shows the frame on or before the slider date.

**Not time series:** answers that are not a time series render as today (2D answer points,
cells, lanes).

## 6. Data and performance

- **Data sources:** `chokepoints_daily` and `ports_daily*` already hold every day of 2026, so no
  new query is needed.
- **Frame cost:** each playback frame rebuilds only the column layers for the new date (indexes
  are per dataset; lookups are binary searches). Base layers keep the split memo from the final
  review.
- **Visible ports:** the ports layer stays filtered to pre-war baselines of at least 1 call a day.
  Ports are off at rest.

## 7. Testing and verification

**Pure, unit-tested:**
- the elevation scale and minimum height;
- the play-state reducer (play, pause, step, end, restart, scrub-takes-over, reduced-motion step);
- time-series detection and frame extraction, including monthly strings, multiple places and
  missing values;
- the choice of the value column;
- the answer frame on or before a slider date.

**Live (headless Playwright against the deployed app):**
- the resting 3D view;
- mid-playback at end of February and at April;
- the monthly Hormuz question answered and playing (two frames captured);
- the four-chokepoint comparison question;
- a tour step;
- zero console errors.

**Ship:** same as before. Work on `feat/genie-trend`, deploy to DEFAULT after `bundle plan`
shows no deletes, squash-merge to `main` after a history scan, push only when the user says so.
README screenshots are updated.

## 8. Out of scope

- Individual vessel tracks or detections for Feb to Oct (separate research track:
  `.superpowers/research/2026-10-21-historical-vessel-data.md`).
- 3D for lanes, AIS cells or regions.
- Recording a video or GIF of playback (screenshots only here).
