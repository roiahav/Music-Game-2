import { useEffect, useRef } from 'react';

/**
 * Surfaces socket-connection trouble during gameplay as a sticky top banner.
 *
 * Renders directly into <body> via a manually-managed DOM node so it survives
 * across the view branches in each multiplayer screen (which have multiple
 * early-return paths, making a normal JSX placement awkward).
 * socket.io-client retries automatically; this hook is purely informational.
 *
 * Behaviour: hidden when `connected === true`. Otherwise becomes visible
 * after a 1.5-second grace period (so brief blips don't flash) and escalates
 * to "ניתוק נמשך — רענן" if reconnect doesn't succeed within ~10 seconds.
 *
 * Usage: call once near the top of a multiplayer screen component, anywhere
 * the `connected` state is in scope. No JSX needed.
 */
export function useConnectionLostBanner(connected) {
  const elRef = useRef(null);
  const showTimer = useRef(null);
  const stallTimer = useRef(null);

  // Mount the DOM node once per component lifetime.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'padding:8px 14px', 'font-size:13px', 'font-weight:700',
      'text-align:center', 'direction:rtl',
      'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
      'display:none',
    ].join(';');
    document.body.appendChild(el);
    elRef.current = el;
    return () => { el.remove(); elRef.current = null; };
  }, []);

  // React to connected state changes.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    function show(stalled) {
      el.style.display = 'block';
      el.style.background = stalled ? '#3a1010' : '#3a2a10';
      el.style.color = stalled ? '#ff6b6b' : '#ffb347';
      el.style.borderBottom = `1px solid ${stalled ? '#dc3545' : '#ffb347'}`;
      el.textContent = stalled
        ? '⚠️ ניתוק מהשרת — רענן את הדף או בדוק חיבור אינטרנט'
        : '⏳ מתחבר מחדש לשרת…';
    }
    if (showTimer.current) clearTimeout(showTimer.current);
    if (stallTimer.current) clearTimeout(stallTimer.current);
    if (connected) {
      el.style.display = 'none';
      return;
    }
    showTimer.current = setTimeout(() => show(false), 1500);
    stallTimer.current = setTimeout(() => show(true), 10000);
    return () => {
      clearTimeout(showTimer.current);
      clearTimeout(stallTimer.current);
    };
  }, [connected]);
}
