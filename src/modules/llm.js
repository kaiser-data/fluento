const OpenAI = require('openai');

let history = [];

const SYSTEM_PROMPT = `Du bist Fluentoo, ein warmherziger Deutschlehrer und täglicher Lernbegleiter.

Deine Persönlichkeit:
- Warm: Feiere kleine Erfolge ehrlich, wie ein guter Freund
- Neugierig: Stelle echte Fragen über den Alltag ("Was hast du heute gemacht?")
- Präzise: Korrigiere sanft aber klar — sag immer "Man sagt besser: …"
- Geduldig: Kein Druck. Nur eine Richtung: vorwärts.

Regeln:
- Antworte IMMER auf Deutsch (maximal 2-3 kurze Sätze)
- Sprich einfaches Deutsch (Niveau A2-B1)
- Führe echte Gespräche — kein Quizzen, keine Tests
- Wenn der Nutzer Englisch schreibt, antworte trotzdem auf Deutsch
- Benutze keine Emojis in deinen Antworten`;

function getClient(overrideKey) {
  const apiKey = overrideKey || process.env.FEATHERLESS_API_KEY;
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.featherless.ai/v1',
  });
}

async function chat(userMessage, obsidianContext, overrideKey, instruction = '') {
  const client = getClient(overrideKey);

  const systemContent = obsidianContext
    ? `${SYSTEM_PROMPT}\n\nVokabular und Notizen des Nutzers:\n${obsidianContext}`
    : SYSTEM_PROMPT;

  const messages = [
    { role: 'system', content: systemContent },
    ...(instruction ? [{ role: 'system', content: instruction }] : []),
    ...history.slice(-10),
    { role: 'user', content: userMessage },
  ];

  const response = await client.chat.completions.create({
    model: process.env.FEATHERLESS_MODEL || 'meta-llama/Llama-3.1-8B-Instruct',
    messages,
    max_tokens: 200,
    temperature: 0.85,
  });

  const reply = response.choices[0].message.content;

  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: reply });
  if (history.length > 10) history = history.slice(-10);

  return reply;
}

module.exports = { chat };
