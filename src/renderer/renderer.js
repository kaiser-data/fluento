// ─── State ───────────────────────────────────────────────
const state = {
  isListening: false,
  recognition: null,
};

// ─── Elements ────────────────────────────────────────────
const pet           = document.getElementById('pet');
const speechBubble  = document.getElementById('speech-bubble');
const bubbleText    = document.getElementById('bubble-text');
const chatLog       = document.getElementById('chat-log');
const btnTalk       = document.getElementById('btn-talk');
const btnType       = document.getElementById('btn-type');
const btnSend       = document.getElementById('btn-send');
const textInput     = document.getElementById('text-input');
const textInputArea = document.getElementById('text-input-area');
const statusText    = document.getElementById('status-text');
const settingsPanel = document.getElementById('settings-panel');
const inputObsidian = document.getElementById('input-obsidian');
const inputApiKey   = document.getElementById('input-apikey');
const stageName     = document.getElementById('stage-name');
const streakDisplay = document.getElementById('streak-display');
const pointsDisplay = document.getElementById('points-display');

// ─── UI helpers ──────────────────────────────────────────
let bubbleTimer;

function showBubble(text, ms = 5000) {
  bubbleText.textContent = text;
  speechBubble.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  if (ms > 0) bubbleTimer = setTimeout(() => speechBubble.classList.add('hidden'), ms);
}

function addMessage(role, text) {
  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setStatus(text) { statusText.textContent = text; }

function setPetState(s) {
  pet.classList.remove('listening', 'thinking', 'excited');
  if (s) pet.classList.add(s);
}

function disableInput(on) {
  btnTalk.disabled = on;
  btnType.disabled  = on;
  btnSend.disabled  = on;
  textInput.disabled = on;
}

// ─── Emotion engine ───────────────────────────────────────
const EMOTIONS = {
  laugh: {
    mouth: 'mouth-laugh',
    squint: true,
    emojis: ['🎉','⭐','🌟','✨','💫','🎊'],
    count: 9,
    pet: 'excited',
  },
  smile: {
    mouth: 'mouth-smile',
    squint: false,
    emojis: ['😊','✨','💙','🌟'],
    count: 4,
    pet: null,
  },
  excited: {
    mouth: 'mouth-excited',
    squint: false,
    emojis: ['💪','🔥','⚡','🚀','🎯'],
    count: 6,
    pet: 'excited',
  },
  sad: {
    mouth: 'mouth-sad',
    squint: false,
    emojis: ['💙','🤍','📝'],
    count: 2,
    pet: null,
  },
};

function analyzeEmotion(text) {
  const t = text.toLowerCase();
  if (/ausgezeichnet|fantastisch|perfekt|wunderbar|toll gemacht|super gemacht|hervorragend|bravo/.test(t)) return 'laugh';
  if (/sehr gut|gut gemacht|genau richtig|prima|richtig|weiter so/.test(t)) return 'smile';
  if (/lass uns|komm|auf geht|bereit|los geht|motivier/.test(t)) return 'excited';
  if (/nicht ganz|man sagt besser|fast|leider|fehler|nicht richtig/.test(t)) return 'sad';
  return 'smile';
}

let emotionResetTimer;

function setEmotion(name) {
  const cfg = EMOTIONS[name];
  if (!cfg) return;

  const mouth = document.querySelector('.alien-mouth');
  const eyes  = document.querySelectorAll('.alien-eye');

  mouth.className = 'alien-mouth';
  if (cfg.mouth) mouth.classList.add(cfg.mouth);

  eyes.forEach(e => {
    e.classList.toggle('eye-squint', cfg.squint);
  });

  if (cfg.pet) {
    setPetState(cfg.pet);
    setTimeout(() => setPetState(null), 1200);
  }

  launchEmojis(cfg.emojis, cfg.count);

  clearTimeout(emotionResetTimer);
  emotionResetTimer = setTimeout(() => {
    mouth.className = 'alien-mouth';
    eyes.forEach(e => e.classList.remove('eye-squint'));
  }, 3000);
}

function launchEmojis(emojis, count) {
  const container = document.getElementById('emoji-particles');
  for (let i = 0; i < count; i++) {
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const el = document.createElement('div');
    el.className = 'emoji-particle';
    el.textContent = emoji;

    el.style.left   = `${8 + Math.random() * 84}%`;
    el.style.top    = `${20 + Math.random() * 30}%`;
    el.style.fontSize = `${18 + Math.random() * 18}px`;
    el.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
    el.style.animationDelay   = `${Math.random() * 0.4}s`;

    el.style.setProperty('--drift', `${-80 + Math.random() * 160}px`);
    el.style.setProperty('--rot',   `${-200 + Math.random() * 400}deg`);

    container.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

// ─── Gamification ─────────────────────────────────────────
const STAGES = [
  { name: '🌱 Schüchtern',    min: 0   },
  { name: '🌿 Versucht es',   min: 20  },
  { name: '🌊 Komfortabel',   min: 50  },
  { name: '🔥 Selbstbewusst', min: 100 },
  { name: '🚀 Fluentoo Level',min: 200 },
];

const POINTS_MAP = { laugh: 10, excited: 7, smile: 5, sad: 2 };

let progress = { points: 0, streak: 0, lastDate: null };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function prevDayStr(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getStage(pts) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (pts >= STAGES[i].min) return STAGES[i];
  }
  return STAGES[0];
}

function updateProgressUI() {
  const stage = getStage(progress.points);
  stageName.textContent = stage.name;
  pointsDisplay.textContent = `${progress.points} pts`;
  streakDisplay.textContent = progress.streak >= 3 ? `🔥 ${progress.streak}` :
                               progress.streak > 0  ? `×${progress.streak}` : '';
}

async function awardPoints(emotion) {
  const today = todayStr();
  const pts   = POINTS_MAP[emotion] || 3;
  const prev  = getStage(progress.points);

  if (!progress.lastDate) {
    progress.streak = 1;
  } else if (progress.lastDate === today) {
    // same day — streak stays, add pts
  } else if (progress.lastDate === prevDayStr(today)) {
    progress.streak += 1;
  } else {
    // missed at least one day
    showBubble('Du hast gestern verpasst 😢 Aber heute fängst du neu an! 💪', 5000);
    setEmotion('sad');
    await new Promise(r => setTimeout(r, 1500));
    progress.streak = 1;
  }

  progress.points   += pts;
  progress.lastDate  = today;

  const next = getStage(progress.points);
  if (next.min > prev.min) {
    // Stage up!
    showBubble(`Neues Level: ${next.name}! 🎊 Weiter so!`, 6000);
    setEmotion('laugh');
  } else if (emotion === 'laugh') {
    showBubble('Super! 🎯', 3000);
  } else if (emotion === 'excited' || progress.streak >= 3) {
    showBubble(`Du bist im Flow 🔥 (${progress.streak} in Folge!)`, 3500);
  } else if (emotion === 'sad') {
    showBubble('Fast! 😂 Versuch es nochmal 🔄', 4000);
  } else if (emotion === 'smile' && progress.streak > 1) {
    showBubble('Du wirst besser 🚀 Mach weiter!', 3000);
  }

  await window.fluentoo.saveProgress(progress);
  updateProgressUI();
}

// ─── Core: send message to LLM ───────────────────────────
async function processMessage(userText) {
  if (!userText.trim()) return;

  addMessage('user', userText);
  setPetState('thinking');
  setStatus('Nachdenken…');
  disableInput(true);

  try {
    const response = await window.fluentoo.sendMessage(userText);
    addMessage('assistant', response);
    showBubble(response, 7000);

    const emotion = analyzeEmotion(response);
    setEmotion(emotion);
    await awardPoints(emotion);

    setStatus('Sprechen…');
    await playTTS(response);
  } catch (err) {
    console.error('LLM error:', err);
    addMessage('system', '⚠ ' + (err.message || 'Verbindungsfehler'));
    setPetState(null);
  } finally {
    setStatus('Bereit');
    disableInput(false);
  }
}

// ─── TTS: CambAI → fallback Web Speech ───────────────────
async function playTTS(text) {
  try {
    const b64 = await window.fluentoo.synthesizeSpeech(text);
    if (!b64) throw new Error('no audio');
    await new Promise((resolve, reject) => {
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      audio.onended = resolve;
      audio.onerror  = reject;
      audio.play().catch(reject);
    });
  } catch {
    if (!('speechSynthesis' in window)) return;
    await new Promise((resolve) => {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang  = 'de-DE';
      utt.rate  = 0.88;
      utt.pitch = 1.05;
      utt.onend  = resolve;
      utt.onerror = resolve;
      window.speechSynthesis.speak(utt);
    });
  }
}

// ─── STT: Web Speech API ──────────────────────────────────
async function startListening() {
  // Trigger macOS mic permission dialog via getUserMedia first
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
  } catch (err) {
    addMessage('system', '🎙 Mikrofon-Zugriff verweigert — Systemeinstellungen > Datenschutz > Mikrofon aktivieren');
    setStatus('Kein Mikrofon-Zugriff');
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    textInputArea.classList.remove('hidden');
    textInput.focus();
    setStatus('Bitte tippe deinen Text ✍');
    return;
  }

  const rec = new SR();
  rec.lang = 'de-DE';
  rec.continuous = false;
  rec.interimResults = false;
  state.recognition = rec;
  state.isListening = true;

  btnTalk.classList.add('recording');
  btnTalk.querySelector('.btn-label').textContent = 'Stopp';
  setPetState('listening');
  setStatus('Höre zu… 👂');

  rec.onresult = (e) => {
    const text = Array.from(e.results)
      .map(r => r[0].transcript)
      .join(' ')
      .trim();
    if (text) processMessage(text);
  };

  rec.onerror = (e) => {
    console.error('STT error:', e.error);
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      addMessage('system', '🎙 Mikrofon-Zugriff verweigert — Systemeinstellungen > Datenschutz > Mikrofon');
    } else if (e.error === 'no-speech') {
      setStatus('Nicht gehört — nochmal versuchen');
    } else if (e.error === 'network') {
      setStatus('Netzwerkfehler — tippe stattdessen');
      textInputArea.classList.remove('hidden');
    } else {
      setStatus(`STT Fehler: ${e.error}`);
    }
  };

  rec.onend = () => {
    state.isListening = false;
    btnTalk.classList.remove('recording');
    btnTalk.querySelector('.btn-label').textContent = 'Sprechen';
    setPetState(null);
    setStatus('Bereit');
  };

  rec.start();
}

function stopListening() {
  if (state.recognition) state.recognition.stop();
}

// ─── Talk button ─────────────────────────────────────────
btnTalk.addEventListener('click', () => {
  if (state.isListening) {
    stopListening();
  } else {
    startListening();
  }
});

// ─── Text input ───────────────────────────────────────────
btnType.addEventListener('click', () => {
  textInputArea.classList.toggle('hidden');
  if (!textInputArea.classList.contains('hidden')) textInput.focus();
});

function sendText() {
  const text = textInput.value.trim();
  if (!text) return;
  textInput.value = '';
  processMessage(text);
}

btnSend.addEventListener('click', sendText);
textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendText(); });

// ─── Language selector ────────────────────────────────────
const LANG_CONFIG = {
  de: { name: 'Deutsch',  placeholder: 'Schreib auf Deutsch…'         },
  es: { name: 'Español',  placeholder: 'Escribe en español…'          },
  fr: { name: 'Français', placeholder: 'Écris en français…'           },
  it: { name: 'Italiano', placeholder: 'Scrivi in italiano…'          },
  ja: { name: '日本語',    placeholder: '日本語で書いてください…'       },
};

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang;
    if (lang !== 'de') {
      showBubble(`${LANG_CONFIG[lang].name} — bald verfügbar! 🚧`, 3000);
      return;
    }
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    textInput.placeholder = LANG_CONFIG[lang].placeholder;
  });
});

// ─── Pet click ────────────────────────────────────────────
const greetings = [
  'Wie geht\'s? Alles gut?',
  'Auf geht\'s — üben wir zusammen!',
  'Du machst das super! 🌟',
  'Was hast du heute gelernt?',
  'Weiter so! Immer vorwärts.',
  'Bist du bereit? 🇩🇪',
];

pet.addEventListener('click', () => {
  const msg = greetings[Math.floor(Math.random() * greetings.length)];
  showBubble(msg);
  setEmotion('excited');
});

// ─── Window drag (pet area) ───────────────────────────────
let isDragging = false;
let dragLast = { x: 0, y: 0 };

document.getElementById('pet-container').addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) return;
  isDragging = true;
  dragLast = { x: e.screenX, y: e.screenY };
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.screenX - dragLast.x;
  const dy = e.screenY - dragLast.y;
  dragLast = { x: e.screenX, y: e.screenY };
  window.fluentoo.moveWindow(dx, dy);
});

window.addEventListener('mouseup', () => { isDragging = false; });

// ─── Reminder ─────────────────────────────────────────────
window.fluentoo.onReminder(() => {
  showBubble('🕐 Zeit zum Deutschlernen! Komm, üben wir! 🇩🇪', 10000);
  setEmotion('excited');
});

// ─── Controls ─────────────────────────────────────────────
document.getElementById('btn-close').addEventListener('click', () => window.close());

document.getElementById('btn-settings').addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  await window.fluentoo.saveSettings({
    obsidianPath: inputObsidian.value.trim(),
    apiKey: inputApiKey.value.trim(),
  });
  settingsPanel.classList.add('hidden');
  showBubble('Einstellungen gespeichert!');
});

// ─── Init ─────────────────────────────────────────────────
(async () => {
  const [settings, savedProgress] = await Promise.all([
    window.fluentoo.getSettings(),
    window.fluentoo.getProgress(),
  ]);

  inputObsidian.value = settings.obsidianPath || '';
  progress = savedProgress;

  // Check for missed day on launch
  const today = todayStr();
  if (progress.lastDate && progress.lastDate !== today && progress.lastDate !== prevDayStr(today)) {
    progress.streak = 0;
  }

  updateProgressUI();

  setTimeout(() => {
    showBubble('Hallo! Ich bin Fluentoo — lass uns Deutsch üben! 🇩🇪', 5000);
  }, 600);
})();
