import { beforeEach, describe, expect, it } from 'vitest';
import { createViewport } from '../src/render/viewport';
import { setDevicePixelRatio, stubBoxSize, stubImageSize } from './dom';

/** The real map art, which is what the zoom ceiling is derived from. */
const ART = { width: 1023, height: 1537 };

function build(stage: { width: number; height: number }, dpr = 1) {
  setDevicePixelRatio(dpr);

  const stageEl = document.createElement('div');
  stubBoxSize(stageEl, stage.width, stage.height);

  const image = document.createElement('img');
  stubImageSize(image, ART.width, ART.height);
  stageEl.append(image);
  document.body.append(stageEl);

  return { stageEl, image, viewport: createViewport(stageEl, image) };
}

const heightOf = (image: HTMLImageElement): number => Number.parseInt(image.style.height, 10);

beforeEach(() => {
  document.body.replaceChildren();
  setDevicePixelRatio(1);
});

describe('fitting the board', () => {
  it('fills the height on a landscape viewport, where height runs out first', () => {
    const { image } = build({ width: 1280, height: 668 });
    expect(heightOf(image)).toBe(668);
  });

  it('fills the width on a narrow viewport, where width runs out first', () => {
    // 375 wide against a 2:3 portrait image needs 563 of height.
    const { image } = build({ width: 375, height: 900 });
    expect(heightOf(image)).toBe(Math.round(375 * (ART.height / ART.width)));
  });

  it('re-fits when the window changes', () => {
    const { stageEl, image, viewport } = build({ width: 1280, height: 668 });
    expect(heightOf(image)).toBe(668);

    stubBoxSize(stageEl, 1280, 900);
    viewport.refit();
    expect(heightOf(image)).toBe(900);
  });
});

describe('the zoom ceiling', () => {
  it('stops exactly where the art runs out of pixels', () => {
    const { image, viewport } = build({ width: 1280, height: 668 });

    // 1537 native over a 668 fit.
    expect(viewport.maxZoom).toBeCloseTo(ART.height / 668, 4);

    for (let i = 0; i < 40; i++) viewport.zoomBy(1.25);

    expect(viewport.zoom).toBeCloseTo(viewport.maxZoom, 4);
    // One source pixel per device pixel — no upscaling, ever.
    expect(heightOf(image)).toBe(ART.height);
  });

  it('halves the ceiling on a 2x display, because device pixels are what count', () => {
    const single = build({ width: 1280, height: 668 }, 1).viewport;
    document.body.replaceChildren();
    const double = build({ width: 1280, height: 668 }, 2).viewport;

    expect(double.maxZoom).toBeCloseTo(single.maxZoom / 2, 4);
  });

  it('never drops below fit, however hard you zoom out', () => {
    const { image, viewport } = build({ width: 1280, height: 668 });
    for (let i = 0; i < 40; i++) viewport.zoomBy(1 / 1.25);

    expect(viewport.zoom).toBe(1);
    expect(heightOf(image)).toBe(668);
  });

  it('offers no zoom at all when the art already fits at native size', () => {
    // A viewport taller than the image has nothing left to reveal.
    const { viewport } = build({ width: 2000, height: 2000 });
    expect(viewport.maxZoom).toBe(1);
  });
});

describe('zooming', () => {
  it('scales the board by the factor asked for', () => {
    const { image, viewport } = build({ width: 1280, height: 668 });
    viewport.zoomBy(1.5);

    expect(viewport.zoom).toBeCloseTo(1.5, 4);
    expect(heightOf(image)).toBe(Math.round(668 * 1.5));
  });

  it('returns to fit and scrolls back to the top', () => {
    const { stageEl, image, viewport } = build({ width: 1280, height: 668 });
    viewport.zoomBy(2);
    stageEl.scrollTop = 300;

    viewport.fit();

    expect(viewport.zoom).toBe(1);
    expect(heightOf(image)).toBe(668);
    expect(stageEl.scrollTop).toBe(0);
  });

  it('tells listeners whenever the zoom moves', () => {
    const { viewport } = build({ width: 1280, height: 668 });
    let calls = 0;
    viewport.onChange(() => {
      calls += 1;
    });

    viewport.zoomBy(1.5);
    viewport.fit();
    expect(calls).toBe(2);

    // Already at the floor, so nothing changed and nothing is announced.
    viewport.zoomBy(1 / 2);
    expect(calls).toBe(2);
  });
});

describe('an image that has not loaded yet', () => {
  it('waits for it rather than sizing against zero', () => {
    setDevicePixelRatio(1);
    const stageEl = document.createElement('div');
    stubBoxSize(stageEl, 1280, 668);
    const image = document.createElement('img');
    // naturalWidth is 0 until the bytes arrive.
    Object.defineProperty(image, 'naturalWidth', { value: 0, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 0, configurable: true });
    Object.defineProperty(image, 'complete', { value: false, configurable: true });
    stageEl.append(image);
    document.body.append(stageEl);

    createViewport(stageEl, image);
    expect(image.style.height).toBe('');

    stubImageSize(image, ART.width, ART.height);
    image.dispatchEvent(new Event('load'));

    expect(heightOf(image)).toBe(668);
  });
});
