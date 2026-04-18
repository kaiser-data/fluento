const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { WaveFile } = require('wavefile');

let localTranscriberPromise;

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}

async function convertToWav(inputPath, outputPath) {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  await runCommand(ffmpeg, [
    '-y',
    '-i', inputPath,
    '-ac', '1',
    '-ar', '16000',
    '-f', 'wav',
    outputPath,
  ]);
}

function readWavAudio(wavPath) {
  const wav = new WaveFile(fs.readFileSync(wavPath));
  wav.toBitDepth('32f');
  wav.toSampleRate(16000);

  const samples = wav.getSamples();
  const mono = Array.isArray(samples) ? samples[0] : samples;
  return mono instanceof Float32Array ? mono : Float32Array.from(mono);
}

async function getLocalTranscriber() {
  if (!localTranscriberPromise) {
    localTranscriberPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = process.env.TRANSFORMERS_CACHE || path.join(os.homedir(), '.cache', 'fluentoo', 'transformers');
      fs.mkdirSync(env.cacheDir, { recursive: true });

      const model = process.env.LOCAL_STT_MODEL || 'onnx-community/whisper-base';
      return pipeline('automatic-speech-recognition', model, {
        dtype: {
          encoder_model: 'fp32',
          decoder_model_merged: 'q4',
        },
      });
    })();
  }

  return localTranscriberPromise;
}

async function transcribeLocal(audioBuffer) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluentoo-stt-'));
  const inputPath = path.join(tempDir, 'recording.webm');
  const wavPath = path.join(tempDir, 'recording.wav');

  try {
    fs.writeFileSync(inputPath, audioBuffer);
    await convertToWav(inputPath, wavPath);

    const audioData = readWavAudio(wavPath);
    const transcriber = await getLocalTranscriber();
    const result = await transcriber(audioData, {
      language: 'german',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    return result.text?.trim() || null;
  } catch (err) {
    console.error('Local STT error:', err.message);
    return null;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// STT via an OpenAI-compatible transcription endpoint.
async function transcribeRemote(audioBuffer, sttConfig = {}) {
  const {
    apiKey,
    baseURL = 'https://api.groq.com/openai/v1',
    model = 'whisper-large-v3-turbo',
  } = sttConfig;

  if (!apiKey) return null;

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const tempPath = path.join(os.tmpdir(), `fluentoo_${Date.now()}.webm`);
  fs.writeFileSync(tempPath, audioBuffer);

  try {
    const result = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model,
    });
    return result.text;
  } catch (err) {
    console.error('STT error:', err.message);
    return null;
  } finally {
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }
}

async function transcribe(audioBuffer, sttConfig = {}) {
  const provider = process.env.STT_PROVIDER || 'auto';

  if (provider === 'remote' || (provider === 'auto' && sttConfig.apiKey)) {
    const remoteText = await transcribeRemote(audioBuffer, sttConfig);
    if (remoteText || provider === 'remote') return remoteText;
  }

  if (provider !== 'remote') {
    const localText = await transcribeLocal(audioBuffer);
    if (localText) return localText;
  }

  return null;
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
