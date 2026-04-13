import type { ExtendedError } from '../types';

const { safeString } = require('../legend/utils');

const DEFAULT_XAI_BASE = 'https://api.x.ai/v1';
const DEFAULT_TIMEOUT_MS = 420000;
const DEFAULT_XAI_MODEL = 'grok-4-1-fast';

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : String(value);
}

function resolveTimeoutMs(overrideTimeoutMs = null) {
  const overrideMs = Number(overrideTimeoutMs);
  if (Number.isFinite(overrideMs) && overrideMs > 0) {
    return Math.round(overrideMs);
  }

  const timeoutSec = Number(readEnv('BESCO_REQUEST_TIMEOUT_SEC', ''));
  if (Number.isFinite(timeoutSec) && timeoutSec > 0) {
    return Math.round(timeoutSec * 1000);
  }

  const timeoutMs = Number(readEnv('BESCO_XAI_TIMEOUT_MS', ''));
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.round(timeoutMs);
  }

  return DEFAULT_TIMEOUT_MS;
}

function readApiKey() {
  return safeString(readEnv('BESCO_XAI_API_KEY', readEnv('XAI_API_KEY', ''))).trim();
}

function hasXaiCredentials() {
  return Boolean(readApiKey());
}

function isXaiSexualRoutingEnabled() {
  const raw = safeString(readEnv('BESCO_XAI_FOR_SEXUAL_CONTENT', 'true')).trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function resolveModel(generationType = 'type-pro') {
  const normalizedType = safeString(generationType).trim().toLowerCase() || 'type-pro';
  const genericModel = readEnv('BESCO_XAI_MODEL', '') || readEnv('XAI_MODEL', '');

  if (normalizedType === 'type-flash' || normalizedType === 'flash') {
    return (
      readEnv('BESCO_XAI_MODEL_FLASH', '') ||
      readEnv('XAI_MODEL_FLASH', '') ||
      genericModel ||
      DEFAULT_XAI_MODEL
    );
  }

  return (
    readEnv('BESCO_XAI_MODEL_PRO', '') ||
    readEnv('XAI_MODEL_PRO', '') ||
    genericModel ||
    DEFAULT_XAI_MODEL
  );
}

function extractTextFromResponse(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      return safeString(item?.text || item?.content);
    })
    .join('')
    .trim();
}

function extractFinishReason(payload) {
  return safeString(payload?.choices?.[0]?.finish_reason).trim();
}

function buildXaiEmptyContentError(raw, parsed): ExtendedError {
  const detail = safeString(raw).trim().slice(0, 1200);
  const finishReason = extractFinishReason(parsed);
  const error = new Error(
    finishReason ? `xAI returned empty content (${finishReason}). Raw: ${detail}` : `xAI returned empty content. Raw: ${detail}`
  ) as ExtendedError;
  error.code = finishReason ? `XAI_EMPTY_${finishReason}` : 'XAI_EMPTY_CONTENT';
  error.finishReason = finishReason || null;
  error.rawPayload = parsed || null;
  return error;
}

async function generateXaiJson({ prompt, generationType = 'type-pro', timeoutMs = null }) {
  const apiKey = readApiKey();
  if (!apiKey) {
    throw new Error('xAI credentials are not configured. Set BESCO_XAI_API_KEY.');
  }

  const url = `${safeString(readEnv('BESCO_XAI_API_BASE', DEFAULT_XAI_BASE)).trim().replace(/\/+$/, '')}/chat/completions`;
  const model = resolveModel(generationType);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), resolveTimeoutMs(timeoutMs));

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Return only the requested JSON object. No markdown, no commentary, no wrapper text.'
          },
          {
            role: 'user',
            content: safeString(prompt)
          }
        ]
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (_error) {
      parsed = null;
    }

    if (!response.ok) {
      const detail = safeString(parsed?.error?.message || raw).trim().slice(0, 1500);
      throw new Error(`xAI API error (HTTP ${response.status}): ${detail}`);
    }

    const text = extractTextFromResponse(parsed);
    if (!text) {
      throw buildXaiEmptyContentError(raw, parsed);
    }

    return {
      text,
      raw: parsed,
      model,
      endpointMode: 'chat_completions',
      provider: 'xai'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  generateXaiJson,
  hasXaiCredentials,
  isXaiSexualRoutingEnabled
};
