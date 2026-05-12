# Transfer guide

Документ описывает актуальную архитектуру по ветке `origin/update_front`. Цель - перенести проект на другой backend, другой frontend или внешний API gateway без потери поведения.

## 1. Что делает система

Система генерирует поэтапную биографическую легенду/профиль по структурированному `person`, 16 шкалам `personality_profile`, дополнительному контексту и stage prompts.

Порядок runtime:

1. `stage_0_canon`
2. `stage_1_anchors`
3. `stage_2_fact_bank`
4. `stage_3_blocks`
5. `stage_4_qc`

`stage_0_canon` выполняется локально. `stage_1..stage_4` ходят в LLM provider и требуют `pipeline_state` из предыдущего ответа.

## 2. Карта проекта

### Backend

- `backend/server.ts`
  - Express HTTP API.
  - CORS и JSON body.
  - Валидация request.
  - Нормализация `stage_prompts`.
  - Нормализация `fact_extension_packages`.
  - Endpoint перевода результата.

- `backend/src/gemini/stage-runner.ts`
  - Основной staged pipeline.
  - Нормализация `person` и `personality_profile`.
  - Сборка `canon`.
  - Prompt builders.
  - Gemini/xAI provider routing.
  - JSON retry и safety retry.
  - Repair loops для underfilled fact bank и слабого block/full-text output.
  - Сборка и мутация `pipeline_state`.

- `backend/src/gemini/client.ts`
  - Gemini transport.
  - Выбор модели `type-pro` / `type-flash`.
  - Gemini API key и Vertex access-token modes.
  - Ротация нескольких API keys по `requestId`.
  - Таймауты.

- `backend/src/gemini/xai-client.ts`
  - xAI transport.
  - Опциональный provider для sexuality-heavy rewrite.

- `backend/src/legend/constants.ts`
  - Criteria, life spheres, legend blocks, fact limits, default prompts, QC checks.

- `backend/src/legend/pipeline.ts`
  - Финальный response shaping через `toLegendResponseJson`.
  - Локальные validation helpers.
  - Legacy local pipeline helpers, которые оставлены для совместимости/референса.

### Frontend

- `frontend/src/App.tsx`
  - React UI из пяти stage screens.
  - General info, шкалы, anchors, facts, legend output, QC output.

- `frontend/src/lib/app-controller.ts`
  - Frontend state machine и API client.
  - Stage prerequisites.
  - Ручное редактирование anchors/facts.
  - Regeneration одного anchor/fact через корректирующий stage prompt.
  - Translation requests.
  - Парсинг wrapped API responses.

- `frontend/src/lib/use-profile-legend-controller.ts`
  - React hook, который держит controller и обновляет view.

## 3. Контракт ветки `origin/update_front`

По сравнению с `main` ветка `origin/update_front` меняет только `frontend/src/lib/app-controller.ts`. Главное изменение - интеграция API:

- Старый прямой frontend contract: `/api/generate-profile`, `/api/check-canon-consistency`, `/api/translate-output`.
- Новый frontend contract из `origin/update_front`: `/ai/legend/generate-profile`, `/ai/legend/check-canon-consistency`, `/ai/legend/translate-output`.
- Новый frontend parser ждёт envelope:

```json
{
  "success": true,
  "data": {
    "ok": true,
    "result": {}
  },
  "message": ""
}
```

Если `success: false`, frontend показывает `message`. Если `data` отсутствует или не object, frontend бросает ошибку.

Важно: встроенный backend в этом репозитории всё ещё отдаёт прямые `/api/*` endpoints и прямой JSON без envelope. Чтобы запустить updated frontend против этого backend, нужен proxy/adapter или возврат frontend resolver на `/api/*`.

## 4. Основные data contracts

### `person`

Backend поддерживает текущую плоскую схему и legacy `generalInfo.*`.

Важные normalized fields:

- `gender`
- `name`
- `surname`
- `birth_date`
- `birth_place`
- `current_location`
- `citizenship`
- `ethnicity`
- `religion`
- `hair_color`
- `eye_color`
- `height_weight`
- `education`
- `job`
- `relationship_status`
- `children`
- `languages`
- `sexual_preferences`
- `life_plans`
- `description`

Frontend редактирует name, date of birth, country, height, weight, eye color, hair color, education, occupation, relationship status, children и extra free-form context.

### `personality_profile`

Все 16 значений должны быть integer `1..10`:

- `responsibility`
- `achievement_drive`
- `empathy`
- `discipline`
- `independence`
- `emotional_stability`
- `confidence`
- `openness_to_change`
- `creativity`
- `sexual_expressiveness`
- `dominance_level`
- `wealth`
- `health`
- `social_connection`
- `mission_level`
- `partner_seek_drive`

Невалидные значения возвращают HTTP `400`.

### `pipeline_state`

`pipeline_state` - главный state carrier между этапами.

```json
{
  "canon": {},
  "stage_prompts": {},
  "fact_extension_packages": 0,
  "anchors_timeline": [],
  "anchors_report": {},
  "fact_bank": [],
  "fact_bank_report": {},
  "legend_blocks": {},
  "legend_full_text": "",
  "dating_site_texts": {
    "profile_description": "",
    "looking_for_partner": ""
  },
  "legend_v1_final_json": {},
  "blocks_report": {
    "blocks_meta": {}
  },
  "qc_report": {},
  "pipeline_meta": {}
}
```

Важные `pipeline_meta` fields:

- `provider`
- `generation_type`
- `stage_3_output_mode`
- `canon_profile_consistency`
- `last_completed_stage`
- `generated_at`
- `updated_at`
- `model_name`
- `endpoint_mode`
- `gemini_model`
- `xai_model`

## 5. Backend API

Ниже прямые endpoints из `backend/server.ts`.

### `GET /api/health`

Возвращает статус сервиса, порядок этапов, CORS origins и provider availability.

```json
{
  "ok": true,
  "service": "legend-tu-staged-llm",
  "model": "staged_provider_router_v1",
  "stageOrder": [
    "stage_0_canon",
    "stage_1_anchors",
    "stage_2_fact_bank",
    "stage_3_blocks",
    "stage_4_qc"
  ],
  "corsOrigins": [],
  "providers": {
    "gemini": true,
    "xai_sexual_content": false
  }
}
```

### `GET /api/template`

Возвращает:

- `person_template`
- `personality_profile_template`
- `stage_prompts_template`
- `blocks`
- `criteria`

### `POST /api/generate-profile`

Главный endpoint staged generation.

Request:

```json
{
  "person": {},
  "personality_profile": {},
  "fact_extension_packages": 0,
  "stage_prompts": {},
  "stage_3_output_mode": "both",
  "run_stage": "stage_0_canon",
  "generation_type": "type-pro",
  "pipeline_state": {}
}
```

Поля:

- `run_stage`: `stage_0_canon`, `stage_1_anchors`, `stage_2_fact_bank`, `stage_3_blocks`, `stage_4_qc`.
- `generation_type`: `type-pro` или `type-flash`.
- `stage_3_output_mode`: `blocks`, `full_text`, `both`.
- `fact_extension_packages`: integer, clamp `0..10`.
- `stage_prompts`: partial object; пустые строки отбрасываются.
- `pipeline_state`: обязателен для `stage_1..stage_4`.

Response:

```json
{
  "ok": true,
  "model": "staged_provider_router_v1",
  "input": {},
  "result": {
    "rawText": "{...}",
    "parsedJson": {},
    "finishReason": "PIPELINE_STAGE_COMPLETED:stage_3_blocks",
    "source": "gemini",
    "pipeline": {},
    "requestMeta": {
      "requestId": "",
      "runStage": "stage_3_blocks",
      "generationType": "type-pro",
      "modelUsed": "gemini-2.5-pro"
    }
  },
  "warning": null
}
```

Frontend в первую очередь читает `result.parsedJson.pipeline_state`; fallback - `result.pipeline`.

### `POST /api/check-canon-consistency`

Опциональная проверка после `stage_0_canon`.

Request:

```json
{
  "person": {},
  "personality_profile": {},
  "generation_type": "type-pro",
  "pipeline_state": {}
}
```

Response содержит:

- `result.rawText`
- `result.consistencyReport`
- `result.pipeline`
- `result.requestMeta`

Endpoint обновляет `pipeline_state.pipeline_meta.canon_profile_consistency`.

### `POST /api/translate-output`

Переводит generated output с сохранением JSON shape.

Поддерживаемые `mode` и aliases:

- `full_text`, aliases `story`, `narrative`
- `blocks`, aliases `legend`, `legend_blocks`
- `text`, aliases `focus`, `story_focus`
- `facts`, aliases `fact_bank`, `story_facts`
- `anchors`, alias `anchors_timeline`

Примеры:

```json
{
  "mode": "blocks",
  "target_language": "Russian",
  "generation_type": "type-flash",
  "blocks": {
    "lifestyle": "..."
  }
}
```

```json
{
  "mode": "facts",
  "target_language": "Russian",
  "facts": []
}
```

Translation endpoint по умолчанию использует `type-flash` и timeout `180000 ms`.

## 6. Frontend behavior

Frontend содержит пять экранов:

1. Fill in the info.
2. Anchors.
3. Fact bank.
4. Legend blocks.
5. Quality control.

Важное поведение:

- `runCanon()` вызывает `stage_0_canon`.
- `runAnchors()` вызывает `stage_1_anchors`.
- `runFacts()` вызывает `stage_2_fact_bank`.
- `runNarrative()` вызывает `stage_3_blocks` с `stage_3_output_mode = both`.
- `runQc()` вызывает `stage_4_qc`.
- Поздние stages заблокированы, пока нет нужного previous state.
- Ручные edits anchors/facts мутируют локальный `pipeline_state`.
- Rebuild legend после ручных edits rerun `stage_3_blocks`.
- Recalc QC после ручных edits rerun `stage_4_qc`.
- Translations очищаются при изменении upstream stages.

Frontend request timeouts:

- default: `360000 ms`
- canon consistency: `240000 ms`
- `stage_1_anchors`: `450000 ms`
- `stage_2_fact_bank`: `450000 ms`
- `stage_3_blocks`: `900000 ms`
- `stage_4_qc`: `300000 ms`

## 7. Детали stages

### Stage 0: `stage_0_canon`

Локальный этап:

- нормализует `person`;
- валидирует и нормализует `personality_profile`;
- строит `canon`;
- строит initial `pipeline_state`;
- ставит `last_completed_stage = stage_0_canon`;
- инициализирует пустые anchors, fact bank, blocks, full text, dating-site texts и pending QC.

Finish reason: `PIPELINE_STAGE_0_READY`.

### Stage 1: `stage_1_anchors`

LLM stage:

- требует `pipeline_state.canon`;
- генерирует 8-12 anchors;
- нормализует anchor objects;
- сбрасывает downstream fact bank, blocks, full text, dating-site texts и QC.

Anchor shape:

```json
{
  "id": "anchor_001",
  "year": 2021,
  "month": 6,
  "age": 27,
  "sphere": "career",
  "location": "Warsaw, Poland",
  "event": "",
  "worldview_shift": "",
  "outcome": "",
  "hook": true
}
```

### Stage 2: `stage_2_fact_bank`

LLM stage:

- требует anchors;
- target = `160 + fact_extension_packages * 60`;
- отбрасывает trait-like и weak facts при normalization;
- запускает repair prompt, если valid fact count ниже target;
- строит `fact_bank_report` с coverage и hooks;
- сбрасывает blocks, full text, dating-site texts и QC.

Fact shape:

```json
{
  "id": "fact_001",
  "text": "",
  "sphere": "career",
  "year": 2021,
  "age": 27,
  "hook": false,
  "source": "anchor",
  "source_anchor_id": "anchor_001"
}
```

Valid `source` values:

- `anchor`
- `canon`
- `period_logic`

### Stage 3: `stage_3_blocks`

LLM stage:

- требует fact bank;
- поддерживает `blocks`, `full_text`, `both`;
- нормализует `legend_blocks`;
- нормализует `legend_full_text`;
- генерирует `dating_site_texts`;
- строит или чинит `blocks_report.blocks_meta`;
- может использовать xAI для `sexualPreferences` override;
- переводит QC обратно в pending.

Generated block keys:

- `lifestyle`
- `character`
- `family`
- `friendsAndPets`
- `hobby`
- `job`
- `exRelationships`
- `lifePlans`
- `health`
- `childhoodMemories`
- `travelStories`
- `languageSkills`
- `cooking`
- `car`
- `preference`
- `appearance`
- `sexualPreferences`
- `gifts`

`dating_site_texts`:

```json
{
  "profile_description": "",
  "looking_for_partner": ""
}
```

### Stage 4: `stage_4_qc`

Проверяет:

- canon consistency;
- timeline consistency;
- cross-block consistency;
- trait manifestation;
- drama balance;
- hook distribution;
- anti-template behavior;
- style rules.

QC shape:

```json
{
  "checks": [
    {
      "key": "canon_consistency",
      "title": "Canon Consistency",
      "passed": true,
      "issues": []
    }
  ],
  "summary": {
    "passed_checks": 8,
    "total_checks": 8,
    "ready": true
  }
}
```

## 8. Provider configuration

### Gemini

Model selection:

- `type-flash` -> `BESCO_GEMINI_MODEL_FLASH` или `gemini-2.5-flash`
- `type-pro` -> `BESCO_GEMINI_MODEL_PRO` или `gemini-2.5-pro`
- `BESCO_GEMINI_MODEL` может задать общий override.

Credentials:

- `BESCO_GEMINI_API_KEY`
- `BESCO_GEMINI_API_KEYS`
- `GEMINI_API_KEY`
- `BESCO_GEMINI_ACCESS_TOKEN`
- `GEMINI_ACCESS_TOKEN`

Endpoint mode:

- `BESCO_GEMINI_ENDPOINT_MODE=gemini`
- `BESCO_GEMINI_ENDPOINT_MODE=vertex`

Timeout resolution:

1. stage-specific override;
2. `BESCO_REQUEST_TIMEOUT_SEC`;
3. `BESCO_GEMINI_TIMEOUT_MS`;
4. default `420000 ms`.

### xAI

xAI опционален и используется в основном для sexuality-heavy override.

Переменные:

- `BESCO_XAI_API_KEY`
- `XAI_API_KEY`
- `BESCO_XAI_API_BASE`
- `BESCO_XAI_MODEL`
- `BESCO_XAI_MODEL_PRO`
- `BESCO_XAI_MODEL_FLASH`
- `BESCO_XAI_TIMEOUT_MS`
- `BESCO_XAI_FOR_SEXUAL_CONTENT`

## 9. Docker и local runtime

`docker-compose.yml` запускает:

- `profile-gen-backend` на host port `3001`;
- `profile-gen-frontend` на host port `4200`.

Текущий `frontend/nginx.conf` proxy'ит только `/api/` в backend. Он не proxy'ит `/ai/legend/`. Если используется updated frontend из `origin/update_front`, нужно обновить nginx или добавить внешний API gateway.

## 10. Checklist переноса

1. Сохранить staged API behavior.
2. Сохранить `pipeline_state` для downstream stages и frontend parsing.
3. Оставить `stage_0_canon` локальным и deterministic.
4. Сохранить validation шкал как integer `1..10`.
5. Сохранить normalization anchors и facts.
6. Сохранить downstream invalidation после anchors/facts/manual edits.
7. Сохранить `result.parsedJson.pipeline_state` и `result.pipeline`.
8. Если используется frontend из `origin/update_front`, обеспечить envelope `{ success, data, message }`.
9. Если используется bundled backend напрямую, использовать `/api/*` или adapter для `/ai/legend/*`.
10. Сохранить translation modes и shapes.
11. Сохранить длинные timeouts для stages 1-3.
12. После provider/proxy/frontend изменений прогнать smoke tests.

## 11. Smoke tests

Минимум:

1. `GET /api/health`.
2. `GET /api/template`.
3. `stage_0_canon` с flat `person`.
4. `stage_0_canon` с legacy `generalInfo.dateBirth`.
5. `check-canon-consistency` после stage 0.
6. `stage_1_anchors` с returned `pipeline_state`.
7. `stage_2_fact_bank` с `fact_extension_packages=0`; target `160`.
8. `stage_2_fact_bank` с `fact_extension_packages=1`; target `220`.
9. `stage_3_blocks` с `stage_3_output_mode=both`.
10. `stage_4_qc` после stage 3.
11. `translate-output` для `blocks`, `full_text`, `facts`, `anchors`.
12. Frontend wrapper contract, если используется `/ai/legend/*`.

## 12. Известные риски

- Frontend из `origin/update_front` и bundled backend несовместимы без adapter из-за `/ai/legend/*` + envelope vs direct `/api/*`.
- `frontend/nginx.conf` proxy'ит только `/api/`.
- В `backend/src/gemini/stage-runner.ts` есть legacy и duplicate helper functions. При переносе документировать и переносить нужно фактически вызываемые функции вокруг `runStagePipeline`.
- Stage 3 самый тяжёлый request; frontend, proxy и backend timeouts должны быть согласованы.
- xAI override failure не должен ломать весь stage 3 output; текущий backend сохраняет Gemini output, если override failed.
