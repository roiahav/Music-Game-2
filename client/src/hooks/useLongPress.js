import { useCallback, useEffect, useRef } from 'react';

/**
 * Press-and-hold gesture detector.
 *
 *   const lp = useLongPress({ onLongPress: () => start(), threshold: 500 });
 *   <button {...lp.handlers} onClick={lp.wrapClick(originalClick)}>…</button>
 *
 * - Fires `onLongPress` once after `threshold` ms while the pointer is still down.
 * - `wrapClick` swallows the synthetic click that follows a fired long-press, so a
 *   plain tap (< threshold) keeps its original behaviour while a hold replaces it.
 * - Cancels on pointer up / leave / cancel — moving the finger off the element
 *   ends the gesture, like the platform.
 */
export function useLongPress({ onLongPress, threshold = 500 } = {}) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);
  const cbRef = useRef(onLongPress);
  useEffect(() => { cbRef.current = onLongPress; }, [onLongPress]);

  const clear = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const onPointerDown = useCallback((e) => {
    // Only react to primary button / single-finger touches
    if (e.button != null && e.button !== 0) return;
    firedRef.current = false;
    clear();
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      cbRef.current?.(e);
    }, threshold);
  }, [threshold, clear]);

  const onPointerUp = useCallback(() => { clear(); }, [clear]);
  const onPointerLeave = onPointerUp;
  const onPointerCancel = onPointerUp;

  // If a long-press fired, swallow the trailing click so wrapped buttons (e.g.
  // Champion's SelectBox) don't also open their picker.
  const wrapClick = useCallback((handler) => (e) => {
    if (firedRef.current) {
      firedRef.current = false;
      e.preventDefault?.();
      e.stopPropagation?.();
      return;
    }
    handler?.(e);
  }, []);

  // Suppress the OS context menu on a fired long-press (touch-hold default)
  const onContextMenu = useCallback((e) => {
    if (firedRef.current) e.preventDefault();
  }, []);

  // Cleanup on unmount
  useEffect(() => clear, [clear]);

  return {
    handlers: { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, onContextMenu },
    wrapClick,
    fired: () => firedRef.current,
  };
}
