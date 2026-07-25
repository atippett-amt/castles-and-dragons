/**
 * Zooming and panning the board.
 *
 * The map art is 1023x1537 and the board is height-limited by a landscape
 * viewport, so at "fit" it renders at roughly 43% of the source — more than
 * half the detail in the image is never shown. This lets a player spend that
 * headroom.
 *
 * Zoom is hard-capped at 1:1 with the source in DEVICE pixels, so it can never
 * upscale and never blurs: the ceiling is exactly the resolution the art has.
 * On a HiDPI screen that ceiling is lower in CSS pixels, which is correct — the
 * limit is the image, not the layout.
 *
 * Sizing is driven here rather than in CSS because the fit height depends on
 * both viewport axes and the image's aspect ratio, which a stylesheet cannot
 * express without hardcoding the art's dimensions.
 */

export interface Viewport {
  /** Current zoom, where 1 fits the whole map on screen. */
  readonly zoom: number;
  /** The largest zoom that still shows one source pixel per device pixel. */
  readonly maxZoom: number;
  zoomBy(factor: number): void;
  fit(): void;
  toggleFullscreen(): void;
  /** Recomputes sizing after the window or fullscreen state changes. */
  refit(): void;
  onChange(listener: () => void): void;
}

export function createViewport(
  stage: HTMLElement,
  image: HTMLImageElement,
): Viewport {
  let zoom = 1;
  let fitHeight = 0;
  let maxZoom = 1;
  const listeners: (() => void)[] = [];

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  /** Height at which the whole map is visible, in CSS pixels. */
  function computeFitHeight(): number {
    const ratio = image.naturalHeight / image.naturalWidth;
    if (!Number.isFinite(ratio) || ratio <= 0) return 0;
    // Whichever axis runs out first decides.
    return Math.min(stage.clientHeight, stage.clientWidth * ratio);
  }

  function apply(): void {
    if (fitHeight <= 0) return;
    image.style.height = `${Math.round(fitHeight * zoom)}px`;
    image.style.width = 'auto';
  }

  function recompute(): void {
    fitHeight = computeFitHeight();
    if (fitHeight <= 0) return;

    // The ceiling: one source pixel per device pixel. dpr matters because a
    // 2x screen already draws two device pixels per CSS pixel.
    const nativeCssHeight = image.naturalHeight / (window.devicePixelRatio || 1);
    maxZoom = Math.max(1, nativeCssHeight / fitHeight);
    zoom = Math.min(Math.max(1, zoom), maxZoom);
    apply();
    notify();
  }

  const viewport: Viewport = {
    get zoom() {
      return zoom;
    },
    get maxZoom() {
      return maxZoom;
    },
    zoomBy(factor) {
      const next = Math.min(maxZoom, Math.max(1, zoom * factor));
      if (next === zoom) return;

      // Hold the centre of the view still across the change, so zooming does
      // not throw the player somewhere else on the map.
      const centreX = (stage.scrollLeft + stage.clientWidth / 2) / zoom;
      const centreY = (stage.scrollTop + stage.clientHeight / 2) / zoom;

      zoom = next;
      apply();

      stage.scrollLeft = centreX * zoom - stage.clientWidth / 2;
      stage.scrollTop = centreY * zoom - stage.clientHeight / 2;
      notify();
    },
    fit() {
      zoom = 1;
      apply();
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
      notify();
    },
    toggleFullscreen() {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    },
    refit() {
      recompute();
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };

  // naturalWidth is 0 until the image has loaded, so size again once it has.
  if (image.complete && image.naturalWidth > 0) recompute();
  else image.addEventListener('load', recompute, { once: true });

  window.addEventListener('resize', recompute);
  document.addEventListener('fullscreenchange', recompute);

  attachDragToPan(stage);
  attachWheelZoom(stage, viewport);

  return viewport;
}

/** Click-and-drag anywhere on the board to pan, once it overflows. */
function attachDragToPan(stage: HTMLElement): void {
  let panning = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  stage.addEventListener('pointerdown', (event) => {
    // Never steal a click meant for a banner or a panel control.
    if ((event.target as HTMLElement).closest('.banner, .panel, .report, .battlelog')) return;
    if (stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return;

    panning = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = stage.scrollLeft;
    startTop = stage.scrollTop;
    stage.classList.add('stage--panning');
    // Capture keeps the drag alive if the pointer leaves the stage, but it is
    // an enhancement — panning must not depend on it succeeding.
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      /* no capture available; the drag still tracks while inside the stage */
    }
  });

  stage.addEventListener('pointermove', (event) => {
    if (!panning) return;
    stage.scrollLeft = startLeft - (event.clientX - startX);
    stage.scrollTop = startTop - (event.clientY - startY);
  });

  const stop = (event: PointerEvent): void => {
    if (!panning) return;
    panning = false;
    stage.classList.remove('stage--panning');
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {
      /* nothing was captured */
    }
  };

  stage.addEventListener('pointerup', stop);
  stage.addEventListener('pointercancel', stop);
}

function attachWheelZoom(stage: HTMLElement, viewport: Viewport): void {
  stage.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return; // leave browser page zoom alone
      event.preventDefault();
      viewport.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
    },
    { passive: false },
  );
}
