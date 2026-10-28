/**
 * aiService.js — Central AI Provider Layer
 *
 * All AI calls across the backend route through this module.
 * No component calls Groq (or any provider) directly.
 *
 * Provider: Groq
 * Models:
 *   FULL  → meta-llama/llama-4-scout-17b-16e-instruct        (resume optimization, cover letter, section rewrites)
 *   MINI  → meta-llama/llama-4-scout-17b-16e-instruct   (parsing, analysis, keyword extraction, lightweight tasks)
 */

const Groq = require('groq-sdk');

// ── Model constants ─────────────────────────────────────────────────────────
const MODELS = {
  FULL: 'meta-llama/llama-4-scout-17b-16e-instruct',        // heavy rewriting tasks
  MINI: 'meta-llama/llama-4-scout-17b-16e-instruct',   // parsing, analysis, scoring helpers
};

// ── Lazy Groq client (created once on first use) ──────────────────────────
let _client = null;

function getClient() {
  if (_client) return _client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set in environment variables.');
  }
  _client = new Groq({ apiKey });
  return _client;
}

// ── Retry with exponential backoff ──────────────────────────────────────────
/**
 * Retries an async function up to maxRetries times.
 * Delays: 1s, 2s, 4s between attempts.
 * @param {() => Promise<any>} fn
 * @param {number} maxRetries
 */
async function withRetry(fn, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`[AI] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${err.message}. Retrying in ${delayMs}ms…`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  console.error(`[AI] All ${maxRetries + 1} attempts failed. Last error: ${lastErr.message}`);
  throw lastErr;
}

// ── Strip markdown fences from model output ─────────────────────────────────
function cleanJsonOutput(text) {
  let cleaned = (text || '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\n?/, '');
  cleaned = cleaned.replace(/\n?```$/, '');
  return cleaned.trim();
}

// ── Core: generate plain text ────────────────────────────────────────────────
/**
 * Generates a plain text response.
 * @param {string} prompt
 * @param {string} model  — defaults to MINI
 * @returns {Promise<string>}
 */
async function generateText(prompt, model = MODELS.MINI) {
  const client = getClient();
  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    });
    return (response.choices[0]?.message?.content || '').trim();
  });
}

// ── Core: generate and parse JSON ────────────────────────────────────────────
/**
 * Generates a response that MUST be valid JSON, then parses and returns it.
 * Uses response_format: json_object for models that support it,
 * with a fallback manual parse for models that don't.
 * @param {string} prompt
 * @param {string} model  — defaults to MINI
 * @returns {Promise<object|array>}
 */
async function generateJSON(prompt, model = MODELS.MINI) {
  const client = getClient();
  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a precise JSON-generation assistant. Always respond with valid JSON only — no markdown fences, no explanation, no extra text.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    const raw = (response.choices[0]?.message?.content || '').trim();
    try {
      return JSON.parse(raw);
    } catch {
      // Try cleaning markdown fences added despite instructions
      const cleaned = cleanJsonOutput(raw);
      return JSON.parse(cleaned);
    }
  });
}

/**
 * Same as generateJSON but for prompts that return a JSON ARRAY at the top level.
 * Groq's json_object mode requires the root to be an object, so we wrap it.
 * @param {string} prompt
 * @param {string} model
 * @returns {Promise<array>}
 */
async function generateJSONArray(prompt, model = MODELS.MINI) {
  const client = getClient();
  return withRetry(async () => {
    // Wrap request so root is always an object
    const wrappedPrompt = `${prompt}\n\nReturn the result as a JSON object: { "result": [ ...array here... ] }`;
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a precise JSON-generation assistant. Always respond with valid JSON only — no markdown fences, no explanation.',
        },
        { role: 'user', content: wrappedPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });
    const raw = (response.choices[0]?.message?.content || '').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = JSON.parse(cleanJsonOutput(raw));
    }
    // Unwrap: support { result: [...] } or { variations: [...] } or bare array
    if (Array.isArray(parsed)) return parsed;
    if (parsed.result && Array.isArray(parsed.result)) return parsed.result;
    // Return first array value found
    const firstArr = Object.values(parsed).find(v => Array.isArray(v));
    if (firstArr) return firstArr;
    throw new Error('Expected JSON array but got: ' + JSON.stringify(parsed).slice(0, 200));
  });
}

module.exports = {
  MODELS,
  withRetry,
  generateText,
  generateJSON,
  generateJSONArray,
  cleanJsonOutput,
};
