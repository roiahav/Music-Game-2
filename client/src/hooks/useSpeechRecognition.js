import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Thin wrapper around the Web Speech API (SpeechRecognition).
 * Falls back to `supported: false` on browsers that don't expose it
 * (Firefox desktop, older Safari, in-app webviews).
 *
 * Usage:
 *   const { supported, listening, start, stop } = useSpeechRecognition({
 *     lang: 'he-IL',
 *     onResult: ({ transcript, isFinal }) => { ... },
 *     onError: (e) => { ... },
 *   });
 */
export function useSpeechRecognition({ lang = 'he-IL', onResult, onError } = {}) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  // Keep callback refs fresh so we don't re-create the recognizer on each render
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;
  const supported = !!SR;

  // Lazy-construct + reuse one recognizer per hook instance
  const ensureRec = useCallback(() => {
    if (!SR) return null;
    if (recRef.current) return recRef.current;
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const alts = Array.from(last).map(a => a.transcript);
      onResultRef.current?.({
        transcript: alts[0] || '',
        alternatives: alts,
        isFinal: !!last.isFinal,
      });
    };
    rec.onerror = (e) => { onErrorRef.current?.(e); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    return rec;
  }, [SR, lang]);

  // Update language if it changes (e.g. user toggles UI lang mid-session)
  useEffect(() => {
    if (recRef.current) recRef.current.lang = lang;
  }, [lang]);

  const start = useCallback(() => {
    const rec = ensureRec();
    if (!rec) return false;
    try {
      rec.start();
      setListening(true);
      return true;
    } catch {
      // start() throws if already started — treat as success
      setListening(true);
      return true;
    }
  }, [ensureRec]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    const rec = recRef.current;
    if (rec) { try { rec.abort(); } catch { /* ignore */ } }
  }, []);

  return { supported, listening, start, stop };
}

/** Map UI lang codes ('he', 'en', 'ar', 'ru', 'es') → BCP-47 for SpeechRecognition. */
export function uiLangToBcp47(code) {
  switch (code) {
    case 'he': return 'he-IL';
    case 'en': return 'en-US';
    case 'ar': return 'ar-SA';
    case 'ru': return 'ru-RU';
    case 'es': return 'es-ES';
    default:   return 'he-IL';
  }
}
