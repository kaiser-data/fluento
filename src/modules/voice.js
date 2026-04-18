const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');

// STT via Groq Whisper (OpenAI-compatible)
async function transcribe(audioBuffer, groqKey) {
  if (!groqKey) return null;
  const client = new OpenAI({
    apiKey: groqKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });

  const tempPath = path.join(os.tmpdir(), `fluentoo_${Date.now()}.webm`);
  fs.writeFileSync(tempPath, audioBuffer);

  try {
    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-large-v3-turbo',
    });
    return result.text;
  } catch (err) {
    console.error('STT error:', err.message);
    return null;
  } finally {
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }
}

// TTS via CambAI streaming endpoint → base64 audio
async function synthesize(text, cambKey, voiceId) {
  if (!cambKey || cambKey === 'your-camb-key-here') return null;

  try {
    const response = await fetch('https://client.camb.ai/apis/tts-stream', {
      method: 'POST',
      headers: {
        'x-api-key': cambKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: Number(voiceId) || 147320,
        language: 'de-de',
        speech_model: 'mars-flash', // faster, free-tier friendly
      }),
    });

    if (!response.ok) {
      console.error(`CambAI TTS error: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.toString('base64');
  } catch (err) {
    console.error('CambAI TTS error:', err.message);
    return null;
  }
}

module.exports = { transcribe, synthesize };
