const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluentoo', {
  sendMessage: (text) => ipcRenderer.invoke('send-message', text),
  transcribeAudio: (uint8Array) => ipcRenderer.invoke('transcribe-audio', uint8Array),
  synthesizeSpeech: (text) => ipcRenderer.invoke('synthesize-speech', text),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getProgress: () => ipcRenderer.invoke('get-progress'),
  saveProgress: (p) => ipcRenderer.invoke('save-progress', p),
  moveWindow: (dx, dy) => ipcRenderer.send('move-window', dx, dy),
  onReminder: (cb) => {
    ipcRenderer.on('reminder', cb);
    return () => ipcRenderer.removeListener('reminder', cb);
  },
});
