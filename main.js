const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

require('dotenv').config();

// Enable Web Speech API (must be before app ready)
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI');
app.commandLine.appendSwitch('enable-speech-input');
app.commandLine.appendSwitch('allow-http-screen-capture');

let mainWindow;
let store;

function getStore() {
  if (!store) {
    const Store = require('electron-store');
    store = new Store();
  }
  return store;
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 290,
    height: 470,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  mainWindow.setPosition(width - 310, height - 490);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// Drag the window from the renderer
ipcMain.on('move-window', (event, dx, dy) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
});

// Send user text → Featherless LLM → German response
ipcMain.handle('send-message', async (event, userText) => {
  const llm = require('./src/modules/llm');
  const obsidian = require('./src/modules/obsidian');

  const s = getStore();
  const vaultPath = s.get('obsidianPath') || process.env.OBSIDIAN_VAULT_PATH || '';
  // stored key overrides env (set via settings panel)
  const llmKey = s.get('featherlessKey') || process.env.FEATHERLESS_API_KEY || '';

  const obsidianContext = vaultPath ? await obsidian.getContext(vaultPath) : null;
  return await llm.chat(userText, obsidianContext, llmKey);
});

// Audio buffer → Groq Whisper → transcription text
ipcMain.handle('transcribe-audio', async (event, uint8Array) => {
  const voice = require('./src/modules/voice');
  const s = getStore();
  const groqKey = s.get('groqKey') || process.env.GROQ_API_KEY || '';
  return await voice.transcribe(Buffer.from(uint8Array), groqKey);
});

// Text → CambAI TTS → base64 audio
ipcMain.handle('synthesize-speech', async (event, text) => {
  const voice = require('./src/modules/voice');
  const s = getStore();
  const cambKey = s.get('cambKey') || process.env.CAMB_API_KEY || '';
  const voiceId = s.get('cambVoiceId') || process.env.CAMB_VOICE_ID || '147320';
  return await voice.synthesize(text, cambKey, voiceId);
});

ipcMain.handle('save-settings', async (event, settings) => {
  const s = getStore();
  if (settings.obsidianPath !== undefined) s.set('obsidianPath', settings.obsidianPath);
  if (settings.apiKey !== undefined) s.set('cambKey', settings.apiKey);
  return true;
});

ipcMain.handle('get-settings', async () => {
  const s = getStore();
  return {
    obsidianPath: s.get('obsidianPath', process.env.OBSIDIAN_VAULT_PATH || ''),
    apiKey: s.get('cambKey', ''),
  };
});

ipcMain.handle('get-progress', async () => {
  const s = getStore();
  return s.get('progress', { points: 0, streak: 0, lastDate: null });
});

ipcMain.handle('save-progress', async (event, progress) => {
  const s = getStore();
  s.set('progress', progress);
  return true;
});

app.whenReady().then(async () => {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  // Request microphone access on macOS so the OS permission dialog appears
  if (process.platform === 'darwin') {
    const { systemPreferences } = require('electron');
    await systemPreferences.askForMediaAccess('microphone');
  }

  createWindow();

  // Reminder every 45 minutes
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reminder');
    }
  }, 45 * 60 * 1000);
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
