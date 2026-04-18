const fs = require('fs');
const path = require('path');

const PRIORITY_FILES = [
  'vocab.md', 'Vokabeln.md', 'German.md', 'Deutsch.md',
  'vocabulary.md', 'Wörter.md', 'words.md',
];

const GERMAN_FOLDERS = ['German', 'Deutsch', 'Language', 'Sprachen'];

async function getContext(vaultPath) {
  if (!vaultPath) return null;

  let resolved = vaultPath.replace(/^~/, require('os').homedir());
  if (!fs.existsSync(resolved)) return null;

  let context = '';

  for (const filename of PRIORITY_FILES) {
    const filePath = path.join(resolved, filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8').slice(0, 800);
      context += `[${filename}]:\n${content}\n\n`;
    }
  }

  for (const folder of GERMAN_FOLDERS) {
    const folderPath = path.join(resolved, folder);
    if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      const files = fs.readdirSync(folderPath)
        .filter(f => f.endsWith('.md'))
        .slice(0, 5);
      for (const file of files) {
        const content = fs.readFileSync(path.join(folderPath, file), 'utf-8').slice(0, 500);
        context += `[${folder}/${file}]:\n${content}\n\n`;
      }
    }
  }

  return context.trim() || null;
}

module.exports = { getContext };
