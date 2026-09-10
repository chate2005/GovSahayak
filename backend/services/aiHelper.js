const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "missing_key_placeholder" });

const ACTIVE_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "qwen/qwen3.6-27b"
];

async function createChatCompletion(options) {
  let lastErr = null;
  const requestedModel = options.model;
  const modelsToTry = requestedModel 
    ? [requestedModel, ...ACTIVE_MODELS.filter(m => m !== requestedModel)]
    : ACTIVE_MODELS;

  for (const model of modelsToTry) {
    try {
      const resp = await groq.chat.completions.create({
        ...options,
        model
      });
      return resp;
    } catch (err) {
      lastErr = err;
      console.warn(`[AI Helper] Model ${model} failed (${err.message}) - attempting fallback...`);
    }
  }
  throw lastErr || new Error("All AI models failed to execute.");
}

module.exports = { groq, createChatCompletion, ACTIVE_MODELS };
