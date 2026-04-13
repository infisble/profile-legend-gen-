const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  toLegendResponseJson,
  validateProfile,
  DEFAULT_PERSON_TEMPLATE,
  PERSONALITY_CRITERIA,
  STAGE_PROMPT_DEFAULTS,
  LEGEND_BLOCKS
} = require('./src/legend/pipeline');
const { STAGE_ORDER, runStagePipeline, runCanonProfileConsistencyCheck } = require('./src/gemini/stage-runner');
const { generateGeminiJson } = require('./src/gemini/client');

function resolveEnvFilePath(): string | null {
  const candidates = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const envFilePath = resolveEnvFilePath();
if (envFilePath) {
  dotenv.config({ path: envFilePath });
} else {
  dotenv.config();
}

function readEnv(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === null ? fallback : String(value);
}

function parseCorsOrigins(value: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeStagePromptsPayload(stagePromptsCandidate: unknown): JsonRecord | null {
  if (!stagePromptsCandidate || typeof stagePromptsCandidate !== 'object') {
    return null;
  }

  const normalized: JsonRecord = {};
  for (const [key, value] of Object.entries(stagePromptsCandidate)) {
    if (typeof value === 'string' && value.trim()) {
      normalized[key] = value.trim();
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeFactPackages(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(10, Math.max(0, Math.round(numeric)));
}

function buildDefaultProfileTemplate(): JsonRecord {
  return PERSONALITY_CRITERIA.reduce((acc, item) => {
    acc[item.key] = 5;
    return acc;
  }, {} as JsonRecord);
}

function safeString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
}

function hasConfiguredSecret(name) {
  return Boolean(safeString(readEnv(name, '')).trim());
}

function normalizeTranslationMode(value) {
  const normalized = safeString(value).trim().toLowerCase();
  if (normalized === 'full_text' || normalized === 'story' || normalized === 'narrative') {
    return 'full_text';
  }
  if (normalized === 'blocks' || normalized === 'legend' || normalized === 'legend_blocks') {
    return 'blocks';
  }
  if (normalized === 'text' || normalized === 'focus' || normalized === 'story_focus') {
    return 'text';
  }
  if (normalized === 'facts' || normalized === 'fact_bank' || normalized === 'story_facts') {
    return 'facts';
  }
  if (normalized === 'anchors' || normalized === 'anchors_timeline') {
    return 'anchors';
  }
  return '';
}

function normalizeBlocksTranslationInput(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const normalized = {};
  for (const block of LEGEND_BLOCKS) {
    const text = safeString(candidate[block.key]).trim();
    if (text) {
      normalized[block.key] = text;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeFactsTranslationInput(candidate) {
  if (!Array.isArray(candidate)) {
    return null;
  }

  const normalized = candidate
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: safeString(item.id).trim() || null,
      text: safeString(item.text).trim(),
      sphere: safeString(item.sphere).trim() || null,
      year: Number.isFinite(Number(item.year)) ? Math.round(Number(item.year)) : null,
      age: Number.isFinite(Number(item.age)) ? Math.round(Number(item.age)) : null,
      hook: Boolean(item.hook),
      source: safeString(item.source).trim() || null,
      source_anchor_id: safeString(item.source_anchor_id).trim() || null
    }))
    .filter((item) => item.text);

  return normalized.length > 0 ? normalized : null;
}

function normalizeAnchorsTranslationInput(candidate) {
  if (!Array.isArray(candidate)) {
    return null;
  }

  const normalized = candidate
    .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: safeString(item.id).trim() || null,
      year: Number.isFinite(Number(item.year)) ? Math.round(Number(item.year)) : null,
      month: Number.isFinite(Number(item.month)) ? Math.round(Number(item.month)) : null,
      age: Number.isFinite(Number(item.age)) ? Math.round(Number(item.age)) : null,
      sphere: safeString(item.sphere).trim() || null,
      location: safeString(item.location).trim() || null,
      event: safeString(item.event).trim(),
      worldview_shift: safeString(item.worldview_shift).trim(),
      outcome: safeString(item.outcome).trim(),
      hook: Boolean(item.hook)
    }))
    .filter((item) => item.event || item.worldview_shift || item.outcome);

  return normalized.length > 0 ? normalized : null;
}

function parseJsonStrict(raw) {
  return raw ? JSON.parse(raw) : null;
}

function buildTranslateOutputPrompt({ mode, targetLanguage, text, blocks, facts, anchors }) {
  const normalizedTarget = safeString(targetLanguage).trim() || 'Russian';

  if (mode === 'full_text') {
    return `
You are translating a dating-profile biography from English into ${normalizedTarget}.
Return strict JSON only:
{
  "legend_full_text": "translated text"
}

Rules:
- Translate faithfully into ${normalizedTarget}.
- Preserve first-person voice, tone, paragraph breaks, and the amount of detail.
- The speaker is a woman. When translating into Russian or another gendered language, keep feminine first-person forms.
- Preserve names, surnames, dates, years, numbers, cities, countries, brands, model names, and occupations unless they naturally require translation.
- Do not summarize, shorten, censor, moralize, or add new facts.
- Keep sexual content in the same adult, consensual, legal, and clinical tone. Do not make it more explicit and do not soften it.
- Keep the result readable and natural.

Text to translate:
${JSON.stringify(safeString(text), null, 2)}
`.trim();
  }

  if (mode === 'text') {
    return `
You are translating a profile-related text into ${normalizedTarget}.
Return strict JSON only:
{
  "translated_text": "translated text"
}

Rules:
- Translate faithfully into ${normalizedTarget}.
- Preserve first-person voice, tone, paragraph breaks, detail level, and factual meaning.
- The speaker is a woman. When translating into Russian or another gendered language, keep feminine first-person forms.
- Preserve names, dates, years, numbers, cities, countries, brands, and model names unless they naturally require translation.
- Do not summarize, shorten, censor, moralize, or add new facts.
- Keep sexual content in the same adult, consensual, legal, and clinical tone. Do not make it more explicit and do not soften it.

Text to translate:
${JSON.stringify(safeString(text), null, 2)}
`.trim();
  }

  const orderedBlocks = LEGEND_BLOCKS.reduce((acc, block) => {
    acc[block.key] = safeString(blocks?.[block.key]).trim();
    return acc;
  }, {});

  if (mode === 'facts') {
    return `
You are translating fact-bank items into ${normalizedTarget}.
Return strict JSON only:
{
  "translated_facts": ${JSON.stringify(facts, null, 2)}
}

Rules:
- Preserve array order and object shape.
- Translate only human-language fields such as text. Keep ids, keys, numeric fields, booleans, and linkage fields unchanged.
- The speaker is a woman. When translating into Russian or another gendered language, keep feminine first-person forms.
- Preserve names, dates, years, numbers, cities, countries, brands, and model names unless they naturally require translation.
- Do not summarize, shorten, censor, or add facts.
- Keep sexual content in the same adult, consensual, legal, and clinical tone.

Facts to translate:
${JSON.stringify(facts, null, 2)}
`.trim();
  }

  if (mode === 'anchors') {
    return `
You are translating anchor timeline items into ${normalizedTarget}.
Return strict JSON only:
{
  "translated_anchors": ${JSON.stringify(anchors, null, 2)}
}

Rules:
- Preserve array order and object shape.
- Translate only human-language fields such as event, worldview_shift, outcome, and location when translation is natural. Keep ids, keys, numeric fields, and booleans unchanged.
- The speaker is a woman. When translating into Russian or another gendered language, keep feminine first-person forms.
- Preserve names, dates, years, numbers, cities, countries, brands, and model names unless they naturally require translation.
- Do not summarize, shorten, censor, or add facts.

Anchors to translate:
${JSON.stringify(anchors, null, 2)}
`.trim();
  }

  return `
You are translating dating-profile legend blocks from English into ${normalizedTarget}.
Return strict JSON only:
{
  "legend": ${JSON.stringify(orderedBlocks, null, 2)}
}

Rules:
- Translate faithfully into ${normalizedTarget}.
- Preserve the exact legend keys and key order.
- Translate only the text values, not the JSON structure.
- The speaker is a woman. When translating into Russian or another gendered language, keep feminine first-person forms.
- Preserve first-person voice, paragraph breaks, factual density, names, dates, years, numbers, brands, and model names.
- Do not summarize, shorten, censor, moralize, or add new facts.
- Keep sexual content in the same adult, consensual, legal, and clinical tone. Do not make it more explicit and do not soften it.
- Keep each block as a coherent paragraph-style text.

Legend blocks to translate:
${JSON.stringify(orderedBlocks, null, 2)}
`.trim();
}

const app = express();
const PORT = Number(readEnv('PORT', readEnv('BESCO_PORT', '3001'))) || 3001;
const CORS_ORIGINS = parseCorsOrigins(readEnv('BESCO_CORS_ORIGINS', ''));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isAllowed = CORS_ORIGINS.length === 0 || CORS_ORIGINS.includes(origin);
      callback(null, isAllowed);
    }
  })
);

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'legend-tu-staged-llm',
    model: 'staged_provider_router_v1',
    stageOrder: STAGE_ORDER,
    corsOrigins: CORS_ORIGINS,
    providers: {
      gemini: true,
      xai_sexual_content: hasConfiguredSecret('BESCO_XAI_API_KEY') || hasConfiguredSecret('XAI_API_KEY')
    }
  });
});

app.get('/api/template', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    person_template: DEFAULT_PERSON_TEMPLATE,
    personality_profile_template: buildDefaultProfileTemplate(),
    stage_prompts_template: STAGE_PROMPT_DEFAULTS,
    blocks: LEGEND_BLOCKS,
    criteria: PERSONALITY_CRITERIA
  });
});

app.post('/api/check-canon-consistency', async (req: Request, res: Response) => {
  try {
    const requestId = randomUUID();
    const person = req.body?.person && typeof req.body.person === 'object' ? req.body.person : {};
    const profile = req.body?.personality_profile && typeof req.body.personality_profile === 'object' ? req.body.personality_profile : {};
    const generationType = safeString(req.body?.generation_type).trim().toLowerCase() || 'type-pro';
    const providedPipelineState = req.body?.pipeline_state && typeof req.body.pipeline_state === 'object' ? req.body.pipeline_state : null;

    const validationErrors = validateProfile(profile);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Некорректные значения personality_profile. Допустимы только целые числа 1..10.',
        details: validationErrors
      });
    }

    if (!providedPipelineState) {
      return res.status(400).json({
        error: 'Сначала выполните этап 1 (Canon), чтобы получить pipeline_state для проверки.'
      });
    }

    const checkResult = await runCanonProfileConsistencyCheck({
      person,
      personalityProfile: profile,
      pipelineStateInput: providedPipelineState,
      generationType,
      requestId
    });

    res.json({
      ok: true,
      model: 'staged_provider_router_v1',
      input: {
        person,
        personality_profile: profile,
        generation_type: generationType
      },
      result: {
        rawText: JSON.stringify(checkResult.report, null, 2),
        consistencyReport: checkResult.report,
        pipeline: checkResult.pipelineState,
        requestMeta: {
          requestId,
          generationType,
          modelUsed: checkResult.modelUsed || null
        }
      },
      warning: checkResult.report.warning || null
    });
  } catch (error) {
    console.error('check-canon-consistency error:', error);
    res.status(500).json({
      error: 'Ошибка при проверке Canon JSON и personality_profile',
      details: error.message || String(error)
    });
  }
});

app.post('/api/generate-profile', async (req: Request, res: Response) => {
  try {
    const requestId = randomUUID();

    const person = req.body?.person && typeof req.body.person === 'object' ? req.body.person : {};
    const profile = req.body?.personality_profile && typeof req.body.personality_profile === 'object' ? req.body.personality_profile : {};
    const runStage = safeString(req.body?.run_stage).trim().toLowerCase() || 'stage_0_canon';
    const generationType = safeString(req.body?.generation_type).trim().toLowerCase() || 'type-pro';
    const stage3OutputMode = safeString(req.body?.stage_3_output_mode).trim().toLowerCase() || 'blocks';
    const providedPipelineState = req.body?.pipeline_state && typeof req.body.pipeline_state === 'object' ? req.body.pipeline_state : null;

    if (!STAGE_ORDER.includes(runStage)) {
      return res.status(400).json({
        error: `Неизвестный run_stage: ${runStage}. Допустимо: ${STAGE_ORDER.join(', ')}`
      });
    }

    const validationErrors = validateProfile(profile);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Некорректные значения personality_profile. Допустимы только целые числа 1..10.',
        details: validationErrors
      });
    }

    const stagePrompts = normalizeStagePromptsPayload(req.body?.stage_prompts);
    const factExtensionPackages = normalizeFactPackages(req.body?.fact_extension_packages);

    if (runStage !== 'stage_0_canon' && !providedPipelineState) {
      return res.status(400).json({
        error: 'Для stage_1..stage_4 требуется pipeline_state из предыдущего запроса.'
      });
    }

    const stageResult = await runStagePipeline({
      stageKey: runStage,
      person,
      personalityProfile: profile,
      stagePromptsInput: stagePrompts || {},
      stage3OutputMode,
      factExtensionPackages,
      pipelineStateInput: providedPipelineState,
      generationType,
      requestId
    });

    const pipelineState = stageResult.pipelineState;
    const parsedJson = toLegendResponseJson(pipelineState);

    res.json({
      ok: true,
      model: 'staged_provider_router_v1',
      input: {
        person,
        personality_profile: profile,
        fact_extension_packages: factExtensionPackages,
        stage_prompts: stagePrompts,
        stage_3_output_mode: stage3OutputMode,
        run_stage: runStage,
        generation_type: generationType
      },
      result: {
        rawText: JSON.stringify(parsedJson, null, 2),
        parsedJson,
        finishReason: stageResult.finishReason,
        source: stageResult.source,
        pipeline: pipelineState,
        requestMeta: {
          requestId,
          runStage,
          generationType,
          modelUsed: stageResult.modelUsed || null
        }
      },
      warning: null
    });
  } catch (error) {
    console.error('generate-profile error:', error);
    res.status(500).json({
      error: 'Ошибка при генерации профиля',
      details: error.message || String(error)
    });
  }
});

app.post('/api/translate-output', async (req: Request, res: Response) => {
  try {
    const requestId = randomUUID();
    const mode = normalizeTranslationMode(req.body?.mode);
    const targetLanguage = safeString(req.body?.target_language).trim() || 'Russian';
    const generationType = safeString(req.body?.generation_type).trim().toLowerCase() || 'type-flash';

    if (!mode) {
      return res.status(400).json({
        error: 'Неизвестный mode. Допустимо: full_text, blocks, text, anchors или facts.'
      });
    }

    const text = safeString(req.body?.text).trim();
    const blocks = normalizeBlocksTranslationInput(req.body?.blocks);
    const facts = normalizeFactsTranslationInput(req.body?.facts);
    const anchors = normalizeAnchorsTranslationInput(req.body?.anchors);

    if (mode === 'full_text' && !text) {
      return res.status(400).json({
        error: 'Для mode=full_text требуется непустой text.'
      });
    }

    if (mode === 'text' && !text) {
      return res.status(400).json({
        error: 'Для mode=text требуется непустой text.'
      });
    }

    if (mode === 'blocks' && !blocks) {
      return res.status(400).json({
        error: 'Для mode=blocks требуется объект blocks с legend-текстами.'
      });
    }

    if (mode === 'facts' && !facts) {
      return res.status(400).json({
        error: 'Для mode=facts требуется массив facts.'
      });
    }

    if (mode === 'anchors' && !anchors) {
      return res.status(400).json({
        error: 'Для mode=anchors требуется массив anchors.'
      });
    }

    const prompt = buildTranslateOutputPrompt({
      mode,
      targetLanguage,
      text,
      blocks,
      facts,
      anchors
    });

    const translated = await generateGeminiJson({
      prompt,
      generationType,
      requestId,
      timeoutMs: 180000
    });

    let parsed = null;
    try {
      parsed = parseJsonStrict(translated.text);
    } catch (error) {
      throw new Error(`Переводчик вернул невалидный JSON: ${error.message || String(error)}`);
    }

    if (mode === 'full_text') {
      const translatedText = safeString(parsed?.legend_full_text || parsed?.text).trim();
      if (!translatedText) {
        throw new Error('Переводчик не вернул legend_full_text.');
      }

      return res.json({
        ok: true,
        result: {
          mode,
          target_language: targetLanguage,
          translated_text: translatedText,
          requestMeta: {
            requestId,
            generationType,
            modelUsed: translated.model || null
          }
        }
      });
    }

    if (mode === 'text') {
      const translatedText = safeString(parsed?.translated_text || parsed?.text).trim();
      if (!translatedText) {
        throw new Error('Переводчик не вернул translated_text.');
      }

      return res.json({
        ok: true,
        result: {
          mode,
          target_language: targetLanguage,
          translated_text: translatedText,
          requestMeta: {
            requestId,
            generationType,
            modelUsed: translated.model || null
          }
        }
      });
    }

    if (mode === 'facts') {
      const translatedFacts = normalizeFactsTranslationInput(parsed?.translated_facts || parsed?.facts);
      if (!translatedFacts) {
        throw new Error('Переводчик не вернул translated_facts.');
      }

      return res.json({
        ok: true,
        result: {
          mode,
          target_language: targetLanguage,
          translated_facts: translatedFacts,
          requestMeta: {
            requestId,
            generationType,
            modelUsed: translated.model || null
          }
        }
      });
    }

    if (mode === 'anchors') {
      const translatedAnchors = normalizeAnchorsTranslationInput(parsed?.translated_anchors || parsed?.anchors);
      if (!translatedAnchors) {
        throw new Error('Переводчик не вернул translated_anchors.');
      }

      return res.json({
        ok: true,
        result: {
          mode,
          target_language: targetLanguage,
          translated_anchors: translatedAnchors,
          requestMeta: {
            requestId,
            generationType,
            modelUsed: translated.model || null
          }
        }
      });
    }

    const translatedBlocksSource =
      normalizeBlocksTranslationInput(parsed?.legend) ||
      normalizeBlocksTranslationInput(parsed?.legend_blocks) ||
      normalizeBlocksTranslationInput(parsed?.blocks);

    if (!translatedBlocksSource) {
      throw new Error('Переводчик не вернул legend-блоки.');
    }

    const translatedBlocks = LEGEND_BLOCKS.reduce((acc, block) => {
      const value = safeString(translatedBlocksSource[block.key]).trim();
      if (value) {
        acc[block.key] = value;
      }
      return acc;
    }, {});

    res.json({
      ok: true,
      result: {
        mode,
        target_language: targetLanguage,
        translated_blocks: translatedBlocks,
        requestMeta: {
          requestId,
          generationType,
          modelUsed: translated.model || null
        }
      }
    });
  } catch (error) {
    console.error('translate-output error:', error);
    res.status(500).json({
      error: 'Ошибка при переводе результата',
      details: error.message || String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
import type { Request, Response } from 'express';
import type { JsonRecord } from './src/types';
