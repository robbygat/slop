// Tiny Web Speech API wrapper — lets players SPEAK their edits.
// Returns null when the browser doesn't support speech recognition.

export function createSpeech({ onText, onState }) {
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) return null;

const rec = new SR();
rec.lang = 'en-US';
rec.interimResults = true;
rec.continuous = false;
rec.maxAlternatives = 1;

let listening = false;

rec.onresult = (e) => {
let text = '';
let isFinal = false;
for (const result of e.results) {
text += result[0].transcript;
if (result.isFinal) isFinal = true;
}
onText?.(text.trim(), isFinal);
};
rec.onstart = () => { listening = true; onState?.(true); };
rec.onend = () => { listening = false; onState?.(false); };
rec.onerror = () => { listening = false; onState?.(false); };

return {
toggle() {
if (listening) rec.stop();
else try { rec.start(); } catch { /* already starting */ }
},
stop() { rec.stop(); },
get listening() { return listening; },
};
}
