import { useCallback, useEffect, useRef, useState } from 'react';

export function useSpeechOutput() {
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Cancel speech on unmount
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  const speak = useCallback((text: string) => {
    if (!enabled || !window.speechSynthesis || !text.trim()) return;

    // Cancel anything currently playing
    window.speechSynthesis.cancel();

    // Strip markdown artifacts from Groq output before speaking
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
      .replace(/\*(.+?)\*/g, '$1')        // italic
      .replace(/`(.+?)`/g, '$1')          // code
      .replace(/#{1,6}\s/g, '')           // headings
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
      .replace(/\n{2,}/g, '. ')           // double newlines → pause
      .replace(/\n/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(clean);
    utteranceRef.current = utterance;

    // Prefer an Indian English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang === 'en-IN' || v.name.toLowerCase().includes('india')
    ) || voices.find(
      (v) => v.lang.startsWith('en')
    );
    if (preferred) utterance.voice = preferred;

    utterance.lang = 'en-IN';
    utterance.rate = 0.95;   // slightly slower for clarity
    utterance.pitch = 1.0;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [enabled]);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) window.speechSynthesis?.cancel();
      return !prev;
    });
  }, []);

  return { speak, stop, toggle, speaking, enabled };
}
