import { describe, expect, it } from 'vitest';
import { ANSWER_CAMERA_START, answerCamera, tourReset, type AnswerCamera } from '../answerCamera';
import type { ViewState } from '../MapView';

const home: ViewState = { longitude: 46, latitude: 22, zoom: 4 };
const b1: [[number, number], [number, number]] = [
  [54, 16],
  [57, 26],
];
const b2: [[number, number], [number, number]] = [
  [32, 12],
  [44, 31],
];

describe('answerCamera', () => {
  it('a new answer saves the reader view and fits its bounds', () => {
    const { state, next } = answerCamera(ANSWER_CAMERA_START, { id: 'g-1', bounds: b1 }, home);
    expect(state).toEqual({ shownId: 'g-1', saved: home });
    expect(next).toMatchObject({ ...home, bounds: b1, maxZoom: 7 });
    expect(next?.boundsPadding).toBeDefined();
  });

  it('does nothing while the same answer stays on the map', () => {
    const s: AnswerCamera = { shownId: 'g-1', saved: home };
    const r = answerCamera(s, { id: 'g-1', bounds: b1 }, { ...home, zoom: 6 });
    expect(r.state).toBe(s);
    expect(r.next).toBeNull();
  });

  it('a second answer fits its bounds and keeps the first saved view', () => {
    const fitted: ViewState = { ...home, bounds: b1, maxZoom: 7 };
    const { state, next } = answerCamera({ shownId: 'g-1', saved: home }, { id: 'g-2', bounds: b2 }, fitted);
    expect(state).toEqual({ shownId: 'g-2', saved: home });
    expect(next?.bounds).toEqual(b2);
  });

  it('clearing flies back to the saved view as a fresh object and forgets it', () => {
    const { state, next } = answerCamera({ shownId: 'g-1', saved: home }, null, { ...home, bounds: b1 });
    expect(state).toEqual({ shownId: null, saved: null });
    expect(next).toEqual(home);
    expect(next).not.toBe(home);
  });

  it('an answer without bounds leaves the camera alone', () => {
    const { state, next } = answerCamera(ANSWER_CAMERA_START, { id: 'g-1', bounds: null }, home);
    expect(state).toEqual({ shownId: 'g-1', saved: null });
    expect(next).toBeNull();
  });

  it('after a tour step resets the saved view, clearing does not move the camera', () => {
    const s = tourReset({ shownId: 'g-1', saved: home });
    expect(s).toEqual({ shownId: 'g-1', saved: null });
    const { state, next } = answerCamera(s, null, { ...home, zoom: 5 });
    expect(state).toEqual({ shownId: null, saved: null });
    expect(next).toBeNull();
  });

  it('a new answer during the tour saves the tour view', () => {
    const tourView: ViewState = { longitude: 56, latitude: 26, zoom: 6 };
    const s = tourReset({ shownId: null, saved: home });
    const { state } = answerCamera(s, { id: 'g-3', bounds: b1 }, tourView);
    expect(state.saved).toBe(tourView);
  });
});
