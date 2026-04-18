// ─── State ───────────────────────────────────────────────
const state = {
  isListening: false,
  isTranscribing: false,
  mediaRecorder: null,
  mediaStream: null,
  audioChunks: [],
  recordingStartedAt: 0,
  activeMission: null,
  missionCompleted: false,
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
const inputGroqKey  = document.getElementById('input-groqkey');
const missionCard    = document.getElementById('mission-card');
const missionChoices = document.getElementById('mission-choices');
const missionActive  = document.getElementById('mission-active');
const missionTitle   = document.getElementById('mission-title');
const missionPrompt  = document.getElementById('mission-prompt');
const btnStartMission = document.getElementById('btn-start-mission');
const correctionCard = document.getElementById('correction-card');
const correctionText = document.getElementById('correction-text');
const missionComplete = document.getElementById('mission-complete');
const progressPanel = document.getElementById('progress-panel');
const xpBarFill     = document.getElementById('xp-bar-fill');
const xpCount       = document.getElementById('xp-count');
const stageLabel    = document.getElementById('stage-label');
const streakBadge   = document.getElementById('streak-badge');
const streakVal     = document.getElementById('streak-val');

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

function stripEmojiForTTS(text) {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, '')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function disableInput(on) {
  btnTalk.disabled = on;
  btnType.disabled  = on;
  btnSend.disabled  = on;
  textInput.disabled = on;
  document.querySelectorAll('.mission-choice-btn').forEach(b => b.disabled = on);
}

function resetTalkButton() {
  btnTalk.classList.remove('recording');
  btnTalk.querySelector('.btn-label').textContent = 'Sprechen';
}

// ─── Practice Missions ───────────────────────────────────
// Any genuine attempt (3+ words) counts as a local pass — the LLM handles nuance
const attempted = text => text.trim().split(/\s+/).length >= 3;

const MISSIONS = [
  {
    title: 'Morgen-Check',
    prompt: 'Sag in 1-2 Sätzen, was du heute Morgen gemacht hast.',
    hint: 'Der Nutzer macht eine kurze Sprechübung über seinen Morgen. Korrigiere sanft und antworte kurz.',
    validate: attempted,
  },
  {
    title: 'Restaurant',
    prompt: 'Bestelle ein Getränk und etwas zu essen auf Deutsch.',
    hint: 'Der Nutzer übt eine Restaurantsituation. Hilf mit natürlichem Deutsch für eine Bestellung.',
    validate: attempted,
  },
  {
    title: 'Wochenende',
    prompt: 'Sag, was du am Wochenende machen möchtest.',
    hint: 'Der Nutzer übt Zukunftspläne. Achte besonders auf Wortstellung und Modalverben.',
    validate: attempted,
  },
  {
    title: 'Mini-Story',
    prompt: 'Erzähl kurz von einem schönen Moment diese Woche.',
    hint: 'Der Nutzer übt eine kurze persönliche Geschichte. Korrigiere nur die wichtigste Sache.',
    validate: attempted,
  },
];

function getDailyChoices() {
  // Deterministically pick 3 missions based on today's date, no repeats
  const seed = new Date().getDate();
  const picks = [];
  for (let i = 0; picks.length < 3; i++) {
    const idx = (seed + i) % MISSIONS.length;
    if (!picks.includes(idx)) picks.push(idx);
  }
  return picks.map(i => MISSIONS[i]);
}

function renderMissionChoices() {
  missionChoices.innerHTML = '';
  missionActive.classList.add('hidden');
  const choices = getDailyChoices();
  choices.forEach(mission => {
    const btn = document.createElement('button');
    btn.className = 'mission-choice-btn';
    btn.textContent = mission.title;
    btn.addEventListener('click', () => startMission(mission));
    missionChoices.appendChild(btn);
  });
}

function startMission(mission) {
  state.activeMission = mission;
  state.missionCompleted = false;
  missionCard.classList.add('active');
  missionChoices.classList.add('hidden');
  missionActive.classList.remove('hidden');
  missionTitle.textContent = mission.title;
  missionPrompt.textContent = mission.prompt;
  showBubble(mission.prompt, 6500);
  setEmotion('excited');
  setStatus('Mission aktiv');
}

function buildMissionInstruction() {
  if (!state.activeMission) return '';

  return [
    state.activeMission.hint,
    `Mission: ${state.activeMission.prompt}`,
    'Bewerte grosszuegig: Wenn der Nutzer irgendwie versucht hat, die Mission zu erfuellen — auch mit Fehlern oder einfachem Deutsch — gilt das als Erfolg.',
    'MISSION_RESULT: PASS wenn der Nutzer einen echten Versuch gemacht hat, das Thema anzusprechen.',
    'MISSION_RESULT: FAIL nur wenn der Nutzer komplett am Thema vorbei redet oder gar nichts Relevantes sagt.',
    'Schreibe am Ende exakt eine dieser Zeilen: MISSION_RESULT: PASS oder MISSION_RESULT: FAIL',
    'Wenn der Nutzer einen Grammatikfehler macht, nutze diese Form: "Man sagt besser: ..."',
    'Antworte ermutigend in maximal 2 kurzen Saetzen.',
    'Keine Emojis.',
  ].join('\n');
}

function parseMissionResponse(text) {
  const match = text.match(/MISSION_RESULT:\s*(PASS|FAIL)\s*$/im);
  return {
    passed: match ? match[1].toUpperCase() === 'PASS' : null,
    text: text
      .replace(/MISSION_RESULT:\s*(PASS|FAIL)\s*$/gim, '')
      .trim(),
  };
}

function missionPassedLocally(userText) {
  if (!state.activeMission?.validate) return userText.trim().split(/\s+/).length >= 4;
  return state.activeMission.validate(userText);
}

function extractCorrection(text) {
  const match = text.match(/Man sagt besser:\s*([^\n]+)/i);
  if (!match) return '';
  return match[1].replace(/^["“]|["”]$/g, '').trim();
}

function showCorrection(text) {
  const correction = extractCorrection(text);
  if (!correction) {
    correctionCard.classList.add('hidden');
    correctionText.textContent = '';
    return;
  }

  correctionText.textContent = correction;
  correctionCard.classList.remove('hidden');
}

function completeMission() {
  if (!state.activeMission || state.missionCompleted) return;

  state.missionCompleted = true;
  state.activeMission = null;
  missionCard.classList.remove('active');
  missionChoices.classList.remove('hidden');
  renderMissionChoices();
  missionComplete.classList.remove('hidden');
  setEmotion('laugh');

  setTimeout(() => {
    missionComplete.classList.add('hidden');
  }, 2200);
}

function failMission() {
  if (!state.activeMission) return;

  state.missionCompleted = false;
  missionCard.classList.add('active');
  setEmotion('sad');
  showBubble('Noch nicht ganz. Versuch die Mission nochmal.', 3800);
  setStatus('Mission nochmal versuchen');
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

const STAGE_COLORS = ['#7C4DFF', '#F44336', '#FFB300', '#43A047', '#FF4081'];

function getStageIndex(pts) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (pts >= STAGES[i].min) return i;
  }
  return 0;
}

function getStage(pts) { return STAGES[getStageIndex(pts)]; }

function getXPFill(pts, idx) {
  if (idx >= STAGES.length - 1) return 100;
  const from = STAGES[idx].min;
  const to   = STAGES[idx + 1].min;
  return Math.min(100, Math.round((pts - from) / (to - from) * 100));
}

function triggerLevelUpAnim(idx) {
  const node = document.querySelector(`.snode[data-i="${idx}"]`);
  if (!node) return;
  node.classList.add('levelup');
  setTimeout(() => node.classList.remove('levelup'), 800);
}

function updateProgressUI() {
  const idx   = getStageIndex(progress.points);
  const color = STAGE_COLORS[idx];
  const fill  = getXPFill(progress.points, idx);

  progressPanel.style.setProperty('--sc-active', color);

  document.querySelectorAll('.snode').forEach(node => {
    const i = parseInt(node.dataset.i);
    const c = STAGE_COLORS[i];
    node.style.setProperty('--sc', c);
    node.classList.remove('done', 'active');
    if (i < idx)      node.classList.add('done');
    else if (i === idx) node.classList.add('active');
  });

  document.querySelectorAll('.sconnector').forEach(conn => {
    const i = parseInt(conn.dataset.i);
    conn.style.setProperty('--sc', STAGE_COLORS[i]);
    conn.classList.toggle('done', i < idx);
  });

  xpBarFill.style.width = `${fill}%`;
  xpCount.textContent   = `${progress.points} XP`;
  stageLabel.textContent = STAGES[idx].name.replace(/^\S+\s/, '').toUpperCase();

  if (progress.streak >= 2) {
    streakVal.textContent = `🔥 ${progress.streak}x`;
    streakBadge.classList.remove('hidden');
  } else {
    streakBadge.classList.add('hidden');
  }
}

async function awardPoints(emotion) {
  const today = todayStr();
  const pts   = POINTS_MAP[emotion] || 3;

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

  const nextIdx = getStageIndex(progress.points);
  const prevIdx = getStageIndex(progress.points - pts);
  if (nextIdx > prevIdx) {
    triggerLevelUpAnim(nextIdx);
    showBubble(`Neues Level: ${STAGES[nextIdx].name}! Weiter so!`, 6000);
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

  const instruction = buildMissionInstruction();

  addMessage('user', userText);
  setPetState('thinking');
  setStatus('Nachdenken…');
  disableInput(true);

  try {
    const rawResponse = await window.fluentoo.sendMessage({ text: userText, instruction });
    const missionResult = instruction ? parseMissionResponse(rawResponse) : { passed: null, text: rawResponse };
    if (instruction && missionResult.passed === null) {
      missionResult.passed = missionPassedLocally(userText);
    }
    const response = missionResult.text || rawResponse;

    addMessage('assistant', response);
    showCorrection(response);
    showBubble(response, 7000);

    const emotion = analyzeEmotion(response);
    setEmotion(emotion);
    await awardPoints(emotion);
    if (instruction && missionResult.passed === true) {
      completeMission();
    } else if (instruction && missionResult.passed === false) {
      failMission();
    }

    setStatus('Sprechen…');
    await playTTS(stripEmojiForTTS(response) || response);
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

// ─── STT: microphone recording → local Whisper ────────────
function getRecorderOptions() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];

  const mimeType = types.find(type => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : {};
}

function stopMediaStream() {
  if (!state.mediaStream) return;
  state.mediaStream.getTracks().forEach(track => track.stop());
  state.mediaStream = null;
}

async function startListening() {
  if (state.isListening || state.isTranscribing) return;

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    textInputArea.classList.remove('hidden');
    textInput.focus();
    addMessage('system', '🎙 Sprachaufnahme ist hier nicht verfügbar — bitte tippe deinen Text.');
    setStatus('Bitte tippe deinen Text ✍');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const recorder = new MediaRecorder(stream, getRecorderOptions());

    state.mediaStream = stream;
    state.mediaRecorder = recorder;
    state.audioChunks = [];
    state.recordingStartedAt = Date.now();
    state.isListening = true;

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) state.audioChunks.push(event.data);
    });

    recorder.addEventListener('error', (event) => {
      console.error('Recording error:', event.error);
      addMessage('system', '🎙 Aufnahmefehler — bitte nochmal versuchen.');
      stopListening();
    });

    recorder.addEventListener('stop', transcribeRecording);
    recorder.start();
  } catch (err) {
    console.error('Microphone error:', err);
    addMessage('system', '🎙 Mikrofon-Zugriff verweigert — Systemeinstellungen > Datenschutz > Mikrofon aktivieren');
    setStatus('Kein Mikrofon-Zugriff');
    return;
  }

  btnTalk.classList.add('recording');
  btnTalk.querySelector('.btn-label').textContent = 'Stopp';
  setPetState('listening');
  setStatus('Höre zu… 👂');
}

async function transcribeRecording() {
  const chunks = state.audioChunks;
  const durationMs = Date.now() - state.recordingStartedAt;

  state.isListening = false;
  state.isTranscribing = true;
  state.mediaRecorder = null;
  state.audioChunks = [];
  stopMediaStream();
  resetTalkButton();
  disableInput(true);
  setPetState('thinking');
  setStatus('Transkribiere…');

  try {
    if (!chunks.length || durationMs < 350) {
      setStatus('Nicht gehört — nochmal versuchen');
      return;
    }

    const type = chunks[0].type || 'audio/webm';
    const blob = new Blob(chunks, { type });
    const audioBytes = new Uint8Array(await blob.arrayBuffer());
    const text = await window.fluentoo.transcribeAudio(audioBytes);

    if (!text) {
      addMessage('system', '🎙 Keine Transkription erhalten — lokales STT prüfen oder nochmal sprechen.');
      setStatus('Nicht verstanden');
      return;
    }

    await processMessage(text);
  } catch (err) {
    console.error('STT error:', err);
    addMessage('system', '🎙 STT Fehler — bitte nochmal versuchen oder Text eingeben.');
    setStatus('STT Fehler');
  } finally {
    state.isTranscribing = false;
    setPetState(null);
    disableInput(false);
    if (!state.isListening) setStatus('Bereit');
  }
}

function stopListening() {
  if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
  state.mediaRecorder.stop();
  setStatus('Transkribiere…');
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
btnStartMission.addEventListener('click', () => {
  // Cancel active mission → back to choices
  state.activeMission = null;
  state.missionCompleted = false;
  missionCard.classList.remove('active');
  missionChoices.classList.remove('hidden');
  missionActive.classList.add('hidden');
  correctionCard.classList.add('hidden');
  setStatus('Bereit');
});

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
    groqKey: inputGroqKey.value.trim(),
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
  inputApiKey.value = settings.apiKey || '';
  inputGroqKey.value = settings.groqKey || '';
  progress = savedProgress;

  // Check for missed day on launch
  const today = todayStr();
  if (progress.lastDate && progress.lastDate !== today && progress.lastDate !== prevDayStr(today)) {
    progress.streak = 0;
  }

  updateProgressUI();
  renderMissionChoices();

  setTimeout(() => {
    showBubble('Hallo! Ich bin Fluentoo — lass uns Deutsch üben! 🇩🇪', 5000);
  }, 600);
})();
