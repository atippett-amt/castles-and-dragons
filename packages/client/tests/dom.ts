/**
 * Layout stubs for jsdom.
 *
 * jsdom does no layout: every element reports zero width, height and position.
 * Anything in the client that reasons about size — the viewport's fit
 * calculation, the travel of an attack across the board — needs those numbers
 * supplied. These helpers make the pretend geometry explicit at the top of a
 * test rather than leaving assertions quietly comparing zeroes.
 */

export function stubBoxSize(element: Element, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: height, configurable: true });
}

export function stubRect(element: Element, box: { x: number; y: number; w: number; h: number }): void {
  element.getBoundingClientRect = () =>
    ({
      x: box.x,
      y: box.y,
      left: box.x,
      top: box.y,
      right: box.x + box.w,
      bottom: box.y + box.h,
      width: box.w,
      height: box.h,
      toJSON: () => ({}),
    }) as DOMRect;
}

export function stubImageSize(image: HTMLImageElement, width: number, height: number): void {
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true });
  Object.defineProperty(image, 'complete', { value: true, configurable: true });
}

export function setDevicePixelRatio(ratio: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });
}
