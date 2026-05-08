import { useCallback, useEffect, useRef } from 'react';

/**
 * Press-and-hold gesture detector tuned for touch screens.
 *
 *   const lp = useLongPress({ onLongPress: () => start(), threshold: 400 });
 *   <button {...lp.handlers} onClick={lp.wrapClick(originalClick)}>…</button>
 *
 * Fires `onLongPress` once after `threshold` ms while the pointer is still
 * down. `wrapClick` swallows the synthetic click that follows a fired
 * long-press, so a tap keeps its original behaviour while a hold replaces it.
 *
 * Mobile-specific care:
 * - Does NOT cancel on pointerleave — finger micro-drift on a small button
 *   would otherwise kill the gesture before threshold.
 * - Captures the pointer on down so subsequent up/cancel events stay on the
 *   element even if the finger drifts a bit.
 * - Pair with `touch-action: manipulation` (or `none`) on the surface so the
 *   browser doesn't pre-empt the gesture for scroll/zoom — without that, a
 *   tiny finger movement triggers pointercancel and the timer never fires.
 */
export function useLongPress({ onLongPress, threshold = 400 } = {}) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);
  const pointerIdRef = useRef(null);
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
    pointerIdRef.current = e.pointerId;
    // Pin the gesture to the element so a small drag doesn't steal the events
    try { e.currentTarget?.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      cbRef.current?.(e);
    }, threshold);
  }, [threshold, clear]);

  const releaseCapture = useCallback((e) => {
    const id = pointerIdRef.current;
    if (id == null) return;
    try { e?.currentTarget?.releasePointerCapture?.(id); } catch { /* ignore */ }
    pointerIdRef.current = null;
  }, []);

  const onPointerUp = useCallback((e) => { clear(); releaseCapture(e); }, [clear, releaseCapture]);
  const onPointerCancel = onPointerUp;
  // Note: no onPointerLeave — micro finger-drift kills the press otherwise.

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

  // Suppress the OS context menu / iOS callout on a fired long-press
  const onContextMenu = useCallback((e) => {
    if (firedRef.current) e.preventDefault();
  }, []);

  // Cleanup on unmount
  useEffect(() => clear, [clear]);

  return {
    handlers: { onPointerDown, onPointerUp, onPointerCancel, onContextMenu },
    wrapClick,
    fired: () => firedRef.current,
  };
}
