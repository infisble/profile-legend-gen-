import type { ExtendedError, HttpHeaders } from '../types';

const { safeString } = require('../legend/utils');

const DEFAULT_GEMINI_BASE = 'https://generativelanguage.googleapis.com';
const DEFAULT_GEMINI_VERSION = 'v1beta';
const DEFAULT_VERTEX_BASE = 'https://aiplatform.googleapis.com';
const DEFAULT_VERTEX_VERSION = 'v1/publishers/google';
const DEFAULT_TIMEOUT_MS = 420000;

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : String(value);
}

function parseCsv(value) {
  return safeString(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseGenerationConfig(raw) {
  const trimmed = safeString(raw).trim();
  if (!trimmed) {
    return {
      temperature: 0.7,
      responseMimeType: 'application/json'
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('generation config must be JSON object');
    }
    return parsed;
  } catch (_error) {
    return {
      temperature: 0.7,
      responseMimeType: 'application/json'
    };
  }
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

  const timeoutMs = Number(readEnv('BESCO_GEMINI_TIMEOUT_MS', ''));
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.round(timeoutMs);
  }

  return DEFAULT_TIMEOUT_MS;
}

function resolveModel(generationType = 'type-pro') {
  const normalizedType = safeString(generationType).trim().toLowerCase() || 'type-pro';
  const genericModel = readEnv('BESCO_GEMINI_MODEL', '') || readEnv('GEMINI_MODEL', '');
  if (normalizedType === 'type-flash' || normalizedType === 'flash') {
    return (
      readEnv('BESCO_GEMINI_MODEL_FLASH', '') ||
      readEnv('GEMINI_MODEL_FLASH', '') ||
      (/flash/i.test(genericModel) ? genericModel : '') ||
      'gemini-2.5-flash'
    );
  }

  return (
    readEnv('BESCO_GEMINI_MODEL_PRO', '') ||
    readEnv('GEMINI_MODEL_PRO', '') ||
    (/pro/i.test(genericModel) ? genericModel : '') ||
    'gemini-2.5-pro'
  );
}

function resolveApiKeys() {
  const keys = [
    ...parseCsv(readEnv('BESCO_GEMINI_API_KEYS', '')),
    safeString(readEnv('BESCO_GEMINI_API_KEY', '')).trim(),
    safeString(readEnv('GEMINI_API_KEY', '')).trim()
  ].filter(Boolean);

  return Array.from(new Set(keys));
}

function resolveEndpointMode() {
  const raw = safeString(readEnv('BESCO_GEMINI_ENDPOINT_MODE', 'gemini')).trim().toLowerCase();
  return raw === 'vertex' ? 'vertex' : 'gemini';
}

function pickApiKey(apiKeys, requestId = '') {
  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    return '';
  }

  let hash = 0;
  for (let i = 0; i < requestId.length; i += 1) {
    hash = (hash * 31 + requestId.charCodeAt(i)) >>> 0;
  }
  return apiKeys[hash % apiKeys.length];
}

function resolveAuthConfig({ generationType, requestId, timeoutMs = null }) {
  const endpointMode = resolveEndpointMode();
  const model = resolveModel(generationType);
  const accessToken = safeString(readEnv('BESCO_GEMINI_ACCESS_TOKEN', readEnv('GEMINI_ACCESS_TOKEN', ''))).trim();
  const apiKeys = resolveApiKeys();
  const apiKey = pickApiKey(apiKeys, requestId);

  const apiBase =
    safeString(readEnv('BESCO_GEMINI_API_BASE', '')).trim() ||
    (endpointMode === 'vertex' ? DEFAULT_VERTEX_BASE : DEFAULT_GEMINI_BASE);
  const apiVersion =
    safeString(readEnv('BESCO_GEMINI_API_VERSION', '')).trim() ||
    (endpointMode === 'vertex' ? DEFAULT_VERTEX_VERSION : DEFAULT_GEMINI_VERSION);

  return {
    endpointMode,
    model,
    apiBase,
    apiVersion,
    accessToken,
    apiKey,
    timeoutMs: resolveTimeoutMs(timeoutMs),
    generationConfig: parseGenerationConfig(readEnv('BESCO_GEMINI_GENERATION_CONFIG', ''))
  };
}

function buildGenerateUrl({ endpointMode, apiBase, apiVersion, model, apiKey }) {
  const base = `${apiBase.replace(/\/+$/, '')}/${apiVersion.replace(/^\/+/, '')}`;
  const path = endpointMode === 'vertex' ? `models/${model}:generateContent` : `models/${model}:generateContent`;
  const url = new URL(`${base}/${path}`);
  if (apiKey) {
    url.searchParams.set('key', apiKey);
  }
  return url.toString();
}

function extractTextFromResponse(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((item) => safeString(item?.text))
    .join('')
    .trim();
}

function extractFinishReason(payload) {
  return safeString(payload?.candidates?.[0]?.finishReason).trim();
}

function buildGeminiEmptyContentError(raw, parsed): ExtendedError {
  const detail = safeString(raw).trim().slice(0, 1200);
  const finishReason = extractFinishReason(parsed);
  const error = new Error(
    finishReason ? `Gemini returned empty content (${finishReason}). Raw: ${detail}` : `Gemini returned empty content. Raw: ${detail}`
  ) as ExtendedError;

  if (finishReason === 'PROHIBITED_CONTENT') {
    error.code = 'GEMINI_PROHIBITED_CONTENT';
  } else if (finishReason) {
    error.code = `GEMINI_EMPTY_${finishReason}`;
  } else {
    error.code = 'GEMINI_EMPTY_CONTENT';
  }

  error.finishReason = finishReason || null;
  error.rawPayload = parsed || null;
  return error;
}

async function generateGeminiJson({ prompt, generationType = 'type-pro', requestId = '', timeoutMs = null }) {
  const config = resolveAuthConfig({ generationType, requestId, timeoutMs });
  if (!config.apiKey && !config.accessToken) {
    throw new Error('Gemini credentials are not configured. Set BESCO_GEMINI_API_KEY or BESCO_GEMINI_ACCESS_TOKEN.');
  }

  const url = buildGenerateUrl(config);
  const headers: HttpHeaders = {
    'Content-Type': 'application/json'
  };

  if (config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: safeString(prompt) }]
      }
    ],
    generationConfig: config.generationConfig
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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
      throw new Error(`Gemini API error (HTTP ${response.status}): ${detail}`);
    }

    const text = extractTextFromResponse(parsed);
    if (!text) {
      throw buildGeminiEmptyContentError(raw, parsed);
    }

    return {
      text,
      raw: parsed,
      model: config.model,
      endpointMode: config.endpointMode,
      provider: 'gemini'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  generateGeminiJson
};
