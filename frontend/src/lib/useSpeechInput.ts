import { useCallback, useEffect, useRef, useState } from 'react';

export type SpeechInputState = 'idle' | 'listening' | 'unsupported';

interface UseSpeechInputOptions {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  language?: string;
  autoSend?: boolean;
  silenceMs?: number;
}

// Browser SpeechRecognition types (not in default TS lib)
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function useSpeechInput({
  onTranscript,
  onInterim,
  language = 'en-IN',
  autoSend = true,
  silenceMs = 1800,
}: UseSpeechInputOptions) {
  const [state, setState] = useState<SpeechInputState>(() =>
    getSpeechRecognition() ? 'idle' : 'unsupported'
  );

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedRef = useRef('');
  const activeRef = useRef(false);

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  };

  const stop = useCallback(() => {
    activeRef.current = false;
    clearSilenceTimer();
    recognitionRef.current?.stop();
    setState('idle');
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) { setState('unsupported'); return; }
    if (activeRef.current) { stop(); return; }

    accumulatedRef.current = '';
    activeRef.current = true;
    setState('listening');

    const recognition = new Ctor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + final.trim();
      onInterim?.((accumulatedRef.current + (interim ? ' ' + interim : '')).trim());

      if (autoSend) {
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          const text = accumulatedRef.current.trim();
          if (text) { stop(); onTranscript(text); }
        }, silenceMs);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;
      activeRef.current = false;
      clearSilenceTimer();
      setState('idle');
    };

    recognition.onend = () => {
      if (activeRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      } else {
        setState('idle');
      }
    };

    try { recognition.start(); } catch {
      activeRef.current = false;
      setState('idle');
    }
  }, [language, autoSend, silenceMs, onTranscript, onInterim, stop]);

  useEffect(() => () => {
    activeRef.current = false;
    clearSilenceTimer();
    recognitionRef.current?.abort();
  }, []);

  return { state, start, stop, isListening: state === 'listening' };
}
