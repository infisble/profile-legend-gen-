# Документация по переносу Legend TU Pipeline

## Цель документа

Этот документ нужен, чтобы передать систему другому разработчику без потери поведения. Главный фокус:

- какие backend API есть и в каком контракте они работают;
- как устроен stage pipeline;
- какие prompt'ы реально отправляются в модель;
- как работают API key / access token / выбор модели / таймауты;
- что именно нужно перенести 1 в 1, а что можно менять только осознанно.

Документ составлен по фактическому коду проекта, а не по предположениям.

## Что это за система

Система генерирует "легенду" персонажа в 5 этапов:

1. `stage_0_canon`
2. `stage_1_anchors`
3. `stage_2_fact_bank`
4. `stage_3_blocks`
5. `stage_4_qc`

Отдельно есть необязательная проверка:

6. `POST /api/check-canon-consistency`

Ключевая архитектурная идея:

- `stage_0_canon` выполняется локально на backend, без Gemini;
- `stage_1..stage_4` выполняются через Gemini;
- результат каждого этапа хранится в `pipeline_state`;
- каждый следующий этап обязан получать `pipeline_state` из предыдущего ответа;
- проверка `Canon vs шкалы` не блокирует якоря и не должна быть обязательной.

## Стек и точки входа

- Backend: Node.js + Express 5
- Frontend: Angular 21
- LLM adapter: `backend/src/gemini/client.js`
- Основной stage runner: `backend/src/gemini/stage-runner.js`
- Общие константы: `backend/src/legend/constants.js`
- Формирование output JSON и часть QC/эвристик: `backend/src/legend/pipeline.js`
- HTTP API: `backend/server.js`

## Карта файлов для переноса

Ниже список файлов, из которых реально нужно переносить логику:

- `backend/server.js`
  - HTTP routes
  - request validation
  - нормализация `stage_prompts` и `fact_extension_packages`
  - glue code между HTTP и stage runner

- `backend/src/gemini/client.js`
  - выбор модели `pro/flash`
  - выбор Gemini/Vertex endpoint
  - авторизация API key или bearer token
  - deterministic rotation нескольких API keys
  - timeout logic
  - фактический HTTP request в модель

- `backend/src/gemini/stage-runner.js`
  - `normalizeIncomingPerson`
  - `buildCanon`
  - `buildCanonPromptData`
  - `buildCanonConsistencyPrompt`
  - `buildStage1Prompt`
  - `buildStage2Prompt`
  - `buildStage3Prompt`
  - `buildStage4Prompt`
  - `runStagePipeline`
  - `runCanonProfileConsistencyCheck`
  - invalidation logic между этапами

- `backend/src/legend/constants.js`
  - `PERSONALITY_CRITERIA`
  - `LIFE_SPHERES`
  - `LEGEND_BLOCKS`
  - `FACT_LIMITS`
  - дефолтные `STAGE_PROMPT_DEFAULTS`
  - `QC_CHECKS`

- `backend/src/legend/pipeline.js`
  - `toLegendResponseJson`
  - `buildShortSummary`
  - эвристика `validateCanonProfileConsistency`
  - совместимость формата output

- `frontend/src/app/app.ts`
  - базовый payload
  - таймауты запросов
  - правила prerequisites для этапов
  - optional consistency check
  - чтение `pipeline_state` из ответа
  - manual editors и повторный запуск stage 3 / stage 4

- `backend/.env.example`
  - список env-переменных и рекомендуемые defaults

- `docker-compose.yml`
  - текущая схема локального/серверного запуска

## Что обязательно перенести

Если переносить систему в другой сервис, язык или framework, ниже перечислен минимум, который нельзя ломать без сознательного редизайна:

- Контракт `POST /api/generate-profile`
- Контракт `POST /api/check-canon-consistency`
- Поле `pipeline_state` и его структура
- Порядок этапов `stage_0_canon -> stage_1_anchors -> stage_2_fact_bank -> stage_3_blocks -> stage_4_qc`
- Логику `fact_extension_packages`
- Логику `stage_prompts`
- Нормализацию входного `person`, включая старую схему `generalInfo.*`
- JSON-only ответы модели
- Merge локальной эвристики + Gemini в `check-canon-consistency`
- Таймауты длинных этапов
- Разделение `type-pro` и `type-flash`

## Backend API

### 1. `GET /api/health`

Назначение:

- быстрая проверка живости сервиса;
- вернуть текущий `stageOrder`;
- показать применённый сервисный label.

Возвращает:

```json
{
  "ok": true,
  "service": "legend-tu-staged-gemini",
  "model": "gemini_stage_runner_v1",
  "stageOrder": [
    "stage_0_canon",
    "stage_1_anchors",
    "stage_2_fact_bank",
    "stage_3_blocks",
    "stage_4_qc"
  ],
  "corsOrigins": []
}
```

### 2. `GET /api/template`

Назначение:

- отдать frontend шаблон `person`;
- отдать шаблон personality scales 1..10;
- отдать дефолтные stage prompts;
- отдать список legend blocks и criteria.

### 3. `POST /api/generate-profile`

Главный endpoint для stage pipeline.

#### Request body

```json
{
  "person": {},
  "personality_profile": {
    "responsibility": 5,
    "achievement_drive": 5
  },
  "fact_extension_packages": 0,
  "stage_prompts": {
    "stage_1_anchors_prompt": "..."
  },
  "run_stage": "stage_0_canon",
  "generation_type": "type-pro",
  "pipeline_state": {}
}
```

#### Поля request

- `person`: JSON-объект анкеты персонажа
- `personality_profile`: 16 шкал, только целые числа `1..10`
- `fact_extension_packages`: integer `0..10`
- `stage_prompts`: объект с кастомными prompt'ами этапов
- `stage_3_output_mode`: режим этапа блоков: `blocks | full_text | both`
- `run_stage`: один из `stage_0_canon | stage_1_anchors | stage_2_fact_bank | stage_3_blocks | stage_4_qc`
- `generation_type`: `type-pro` или `type-flash`
- `pipeline_state`: обязателен для `stage_1..stage_4`

#### Важные правила

- `express.json` ограничен `2mb`
- если `run_stage != stage_0_canon` и нет `pipeline_state`, backend возвращает `400`
- `personality_profile` валидируется до вызова модели
- `stage_prompts` очищается: пустые строки не сохраняются
- `fact_extension_packages` clamp: `0..10`

#### Response body

```json
{
  "ok": true,
  "model": "gemini_stage_runner_v1",
  "input": {
    "person": {},
    "personality_profile": {},
    "fact_extension_packages": 0,
    "stage_prompts": {},
    "stage_3_output_mode": "blocks",
    "run_stage": "stage_1_anchors",
    "generation_type": "type-pro"
  },
  "result": {
    "rawText": "{...}",
    "parsedJson": {
      "short_summary": "...",
      "life_story": "...",
      "legend_full_text": "...",
      "legend_blocks": {},
      "legend_v1_final_json": {},
      "anchors": [],
      "fact_bank_stats": {},
      "blocks_report": {},
      "qc_report": {},
      "pipeline_state": {}
    },
    "finishReason": "PIPELINE_STAGE_COMPLETED:stage_1_anchors",
    "source": "gemini",
    "pipeline": {},
    "requestMeta": {
      "requestId": "...",
      "runStage": "stage_1_anchors",
      "generationType": "type-pro",
      "modelUsed": "gemini-2.5-pro"
    }
  },
  "warning": null
}
```

### 4. `POST /api/check-canon-consistency`

Назначение:

- проверить, нет ли конфликтов между `Canon JSON` и `personality_profile`;
- обновить `pipeline_state.pipeline_meta.canon_profile_consistency`;
- вернуть результат отдельно от основного stage pipeline.

#### Request body

```json
{
  "person": {},
  "personality_profile": {},
  "generation_type": "type-pro",
  "pipeline_state": {}
}
```

#### Важные правила

- endpoint требует `pipeline_state`, который уже пришёл после `stage_0_canon`
- проверка опциональна и не должна блокировать `stage_1_anchors`
- результат строится как merge:
  - локальная эвристика;
  - Gemini-ответ;
  - fallback только на эвристику, если модель недоступна

#### Response body

```json
{
  "ok": true,
  "model": "gemini_canon_consistency_checker_v1",
  "input": {
    "person": {},
    "personality_profile": {},
    "generation_type": "type-pro"
  },
  "result": {
    "rawText": "{...}",
    "consistencyReport": {
      "passed": true,
      "summary": "...",
      "issues": []
    },
    "pipeline": {},
    "requestMeta": {
      "requestId": "...",
      "generationType": "type-pro",
      "modelUsed": "gemini-2.5-pro"
    }
  },
  "warning": null
}
```

## Stage pipeline: фактическая логика

### Stage 0. `stage_0_canon`

Это локальный этап. Gemini не вызывается.

Что делает backend:

- нормализует `person`
- нормализует `personality_profile`
- вычисляет `birth_year`, `age`, `top_traits`
- строит `canon`
- создаёт начальный `pipeline_state`

Критически важно: backend поддерживает две схемы входного JSON:

- текущую "плоскую" схему, например `name`, `birth_date`, `current_location`
- альтернативную схему с `generalInfo.*`

Обязательная совместимость при переносе:

- `generalInfo.name -> name`
- `generalInfo.surname -> surname`
- `generalInfo.dateBirth -> birth_date`
- `generalInfo.country: "Ukraine, Uzhorod" -> current_location.country/current_location.city`
- `generalInfo.occupation -> job.title`
- `generalInfo.education -> education.degree`
- `children[].dateBirth -> children[].birth_date`

Если эту нормализацию потерять, frontend начнёт показывать "возраст не зафиксирован" и "география не зафиксирована" даже при наличии данных.

### Stage 1. `stage_1_anchors`

Вход:

- `canon`
- `stage_1_anchors_prompt`

Выход:

- `anchors_timeline`
- `anchors_report`

Жёсткие требования этапа:

- 8-12 якорей
- каждый якорь должен быть конкретным событием
- допустимые `sphere` только из `LIFE_SPHERES`
- хронология должна быть реалистичной относительно возраста
- явные факты из `description` и structured canon нельзя терять
- если у персонажа есть ребёнок, parenthood должно попасть в anchors

После stage 1 backend сбрасывает:

- `fact_bank`
- `legend_blocks`
- `qc_report`

То есть stage 1 инвалидирует всё, что построено после него.

### Stage 2. `stage_2_fact_bank`

Вход:

- `canon`
- `anchors_timeline`
- `stage_2_fact_bank_prompt`
- `fact_extension_packages`

Выход:

- `fact_bank`
- `fact_bank_report`

Жёсткие требования этапа:

- минимум `150 + fact_extension_packages * 60` фактов
- `fact_extension_packages` ограничен `0..10`
- один факт = одно атомарное событие
- `source` только `anchor | canon | period_logic`
- факт должен иметь временную привязку
- часть фактов должна быть `hook=true`
- backend считает coverage по сферам и отмечает weak spheres

Критично:

- backend явно требует не терять факты из `description` и structured canon
- если в `description` есть дети или питомцы, они обязаны появиться в `fact_bank`

После stage 2 backend сбрасывает:

- `legend_blocks`
- `qc_report`

### Stage 3. `stage_3_blocks`

Вход:

- `canon`
- `anchors_timeline`
- `fact_bank`
- `stage_3_blocks_prompt`
- `stage_3_full_text_prompt`
- `stage_3_output_mode`

Выход:

- `legend`
- `legend_full_text`
- `legend_blocks`
- `legend_v1_final_json`
- `blocks_report.blocks_meta`

Жёсткие требования этапа:

- в режиме `blocks` вернуть объект `legend` со всеми ключами блоков из `LEGEND_BLOCKS` в заданном порядке
- в режиме `full_text` вернуть `legend_full_text` как один большой непрерывный текст без блоков, подзаголовков и списков
- для `full_text` текст должен быть неидеализированным: нельзя автоматически превращать персонажа в слишком осознанного, дисциплинированного, системного или "правильного", если это не следует из фактов
- для `full_text` обязательны признаки живого человека: ошибки, глупые или неловкие ситуации, импульсивные решения, прокрастинация/безделье, жизнь вне работы и целей
- для `full_text` обязательна живая социальная среда: друзья или знакомые с именами и конкретные сцены взаимодействия, а не только общие выводы о людях
- `stage_3_full_text_prompt` теперь требует внутреннюю самопроверку и переписывание до прохождения этих критериев; чеклист наружу не выводится
- в режиме `both` вернуть и `legend`, и `legend_full_text`
- все текстовые выходы пишутся от первого лица и должны быть большими связными текстами
- допускается мягкое правдоподобное доосмысление между фактами, но нельзя ломать canon, anchors и `fact_bank`
- для режима с блоками обязателен `blocks_meta`

### Stage 4. `stage_4_qc`

Вход:

- `canon`
- `anchors_timeline`
- `fact_bank_report`
- `legend_blocks`
- `stage_4_qc_prompt`

Выход:

- `qc_report`

Жёсткие требования этапа:

- вернуть все QC checks из `QC_CHECKS`
- `issues` должны быть короткими и предметными
- оценка должна опираться только на переданные данные

## Отдельная проверка Canon vs шкалы

Эта логика не равна stage 4. Это отдельный endpoint и отдельный prompt.

Что происходит:

1. backend нормализует `person`
2. backend нормализует `personality_profile`
3. backend запускает локальную эвристику `validateCanonProfileConsistency`
4. backend строит prompt и вызывает Gemini
5. backend merge'ит:
   - `issues` из эвристики
   - `issues` из Gemini
   - `passed` = одновременно Gemini + heuristic, если Gemini ответил
   - fallback на одну эвристику, если Gemini не ответил

Что обязательно сохранить при переносе:

- проверка не должна падать, если Gemini недоступен
- локальная эвристика должна остаться
- merge логика не должна заменяться на "только ответ модели"
- результат должен сохраняться в `pipeline_state.pipeline_meta.canon_profile_consistency`

## Prompt system: как он реально устроен

### Источник prompt'ов

Есть 2 слоя prompt'ов:

1. backend prompt shell
2. user-editable stage prompt

Backend prompt shell зашит в `backend/src/gemini/stage-runner.js` и включает:

- role/instruction;
- требование вернуть JSON строго по схеме;
- список допустимых `sphere`, `source`, `qc checks` и т.д.;
- stage-specific hard rules;
- сериализованные JSON payloads в конце prompt'а.

User-editable prompt приходит из `stage_prompts` и вставляется внутрь stage shell как отдельный блок:

- `stage_1_anchors_prompt`
- `stage_2_fact_bank_prompt`
- `stage_3_blocks_prompt`
- `stage_3_full_text_prompt`
- `stage_4_qc_prompt`

### Очень важное правило переноса

Нельзя переносить только пользовательские prompt'ы и игнорировать backend shell. Основная логика качества сидит именно в backend shell:

- JSON schema ответа
- hard requirements по этапу
- explicit retention rules
- block spec / qc spec / canon payload

Если разработчик перенесёт только тексты из UI, система начнёт терять детей, питомцев, named entities и структуры output.

### Что реально передаётся в prompt как Canon JSON

В модель уходит не весь исходный `person`, а нормализованный `buildCanonPromptData(canon)`. В него входят:

- `name`
- `surname`
- `gender`
- `age`
- `birth_date`
- `birth_year`
- `birth_place`
- `current_location`
- `relationship_status`
- `description`
- `height_weight`
- `eye_color`
- `hair_color`
- `children`
- `job`
- `education`
- `languages`
- `life_plans`
- `sexual_preferences`
- `character_traits`
- `core_values`
- `bad_habits`
- `first_impression`
- `temperament`
- `top_traits`
- `personality_profile`
- `source_payload`

Ключевой риск переноса:

- если обрезать `description` или `children`, stage 1 и 2 начнут терять факты про ребёнка, питомцев, хобби и быт
- если не передать `top_traits` и `personality_profile`, станет хуже проявляться связь между каноном и шкалами

### Дефолтные stage prompt'ы

Дефолтные тексты лежат в двух местах:

- backend: `backend/src/legend/constants.js`
- frontend mirror: `frontend/src/app/app.ts`

Это дублирование. При переносе лучше сделать единый источник, иначе backend и UI разъедутся.

Критично для `4B / stage_3_full_text_prompt`:

- это не косметический prompt, а основной антишаблонный фильтр для "Большого текста"
- он теперь явно запрещает идеализировать персонажа без опоры на факты
- он требует бытовые сцены, социальные связи, ошибки, хаос, периоды безделья и жизнь вне целей
- он требует внутренний цикл self-check -> rewrite до тех пор, пока текст не перестанет ощущаться искусственно осознанным

## Логика с API key, access token, моделями и таймаутами

### Выбор провайдера и endpoint

Поддерживаются два режима:

- `BESCO_GEMINI_ENDPOINT_MODE=gemini`
- `BESCO_GEMINI_ENDPOINT_MODE=vertex`

По умолчанию используется:

- `gemini` mode, если env не задан

Параметры base URL:

- Gemini API default: `https://generativelanguage.googleapis.com`
- Gemini version default: `v1beta`
- Vertex API default: `https://aiplatform.googleapis.com`
- Vertex version default: `v1/publishers/google`

### Выбор модели

Переключение делается через `generation_type`:

- `type-pro` -> `BESCO_GEMINI_MODEL_PRO` или fallback `gemini-2.5-pro`
- `type-flash` -> `BESCO_GEMINI_MODEL_FLASH` или fallback `gemini-2.5-flash`

Также поддерживаются legacy aliases:

- `BESCO_GEMINI_MODEL`
- `GEMINI_MODEL`
- `GEMINI_MODEL_PRO`
- `GEMINI_MODEL_FLASH`

Если `generation_type` не `type-flash`, система идёт в pro-mode.

### Аутентификация

Поддерживаются 2 режима авторизации:

1. API key
2. Bearer access token

Источники credentials:

- `BESCO_GEMINI_API_KEYS` - CSV список ключей
- `BESCO_GEMINI_API_KEY`
- `GEMINI_API_KEY`
- `BESCO_GEMINI_ACCESS_TOKEN`
- `GEMINI_ACCESS_TOKEN`

### Логика нескольких API key

Если задано несколько ключей, backend не выбирает случайный ключ. Он делает детерминированный выбор:

- берёт `requestId`
- считает hash по символам
- выбирает `apiKeys[hash % apiKeys.length]`

Это важно сохранить, если нужна равномерная и воспроизводимая раскладка запросов по ключам.

### Generation config

Если env `BESCO_GEMINI_GENERATION_CONFIG` не задан, используется:

```json
{
  "temperature": 0.7,
  "responseMimeType": "application/json"
}
```

Критично:

- `responseMimeType=application/json` - часть контракта
- без этого парсинг stage output станет нестабильным

### Таймауты backend

Общий default:

- `420000 ms`

Источник:

- `BESCO_REQUEST_TIMEOUT_SEC`, если задан
- иначе `BESCO_GEMINI_TIMEOUT_MS`
- иначе default `420000`

Stage-specific timeouts в runner:

- `canon_profile_consistency`: `240000`
- `stage_1_anchors`: `420000`
- `stage_2_fact_bank`: `420000`
- `stage_3_blocks`: `300000`
- `stage_4_qc`: `300000`

### Таймауты frontend

- default request timeout: `360000`
- consistency check: `240000`
- `stage_1_anchors`: `450000`
- `stage_2_fact_bank`: `450000`

При переносе нужно синхронизировать client timeout и server timeout. Иначе браузер будет abort делать раньше сервера.

## Логика с токенами в смысле размера prompt/output

Сейчас в коде нет явного контроля token budget. То есть:

- не задаётся `maxOutputTokens`
- не считается размер prompt в токенах
- не делается автоматический trimming `fact_bank` или `legend_blocks`

Что реально ограничивает длинные этапы сейчас:

- таймауты
- выбранная модель `pro/flash`
- естественные лимиты самого Gemini API

Последствия:

- самые тяжёлые этапы по размеру prompt: `stage_2_fact_bank`, `stage_3_blocks`, `stage_4_qc`
- при переносе на другой LLM provider нужно отдельно проверить, влезают ли prompt'ы по context window
- если новый provider строже по токенам, придётся добавлять явное budget management

Что рекомендую добавить при переносе, если переносится на новый стек или новый LLM:

1. Логировать примерный размер prompt в символах и токенах по каждому этапу
2. Логировать размер ответа модели
3. Ввести `maxOutputTokens` как отдельную настройку по этапам
4. Если provider не гарантирует JSON mode, использовать schema-enforced output

Но важно: это улучшения. В текущем контракте проекта такого контроля нет, и перенос 1 в 1 должен сначала повторить текущее поведение.

## `pipeline_state`: что именно хранится

Минимально важные поля:

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
  "legend_v1_final_json": {},
  "blocks_report": {},
  "qc_report": {},
  "pipeline_meta": {}
}
```

Что особенно важно:

- `canon` - база для всех последующих этапов
- `stage_prompts` - сохраняются в state и могут быть частично обновлены
- `fact_extension_packages` - влияет на target facts
- `pipeline_meta.stage_3_output_mode` - хранит выбранный режим этапа блоков
- `pipeline_meta.last_completed_stage` - используется для понимания текущего прогресса
- `pipeline_meta.canon_profile_consistency` - состояние отдельной проверки

Семантика обновления `stage_prompts`:

- для `stage_0_canon` state создаётся с prompt'ами из request
- для следующих этапов новые prompt'ы merge'ятся поверх старых
- пустые строки не должны затирать существующие значения

## Формат output, который реально использует frontend

Frontend читает:

- `result.parsedJson.short_summary`
- `result.parsedJson.life_story`
- `result.parsedJson.legend_full_text`
- `result.parsedJson.legend_blocks`
- `result.parsedJson.qc_report`
- `result.parsedJson.pipeline_state`

Также frontend fallback'ом читает:

- `result.pipeline`

То есть при переносе желательно сохранить оба поля:

- `parsedJson.pipeline_state`
- `result.pipeline`

Иначе UI можно сломать частично даже при корректном backend.

## Frontend логика, которую нужно учесть при переносе

### Базовый payload

Frontend отправляет:

```json
{
  "person": {},
  "personality_profile": {},
  "fact_extension_packages": 0,
  "stage_prompts": {}
}
```

И дальше добавляет:

- `run_stage`
- `generation_type`
- `pipeline_state`, если stage не `stage_0_canon`

### Разрешение API URL

Правило сейчас такое:

- если frontend открыт на `localhost:4200` или `localhost:5173`, запросы идут на `http://localhost:3001`
- иначе используется same-origin `/api/...`

При переносе фронта в другой домен/порт это правило нужно либо сохранить, либо заменить на env-конфиг.

### Prerequisites на фронте

Frontend не даёт запускать:

- `stage_2_fact_bank`, если нет anchors
- `stage_3_blocks`, если нет fact bank
- `stage_4_qc`, если нет legend blocks

Но `stage_1_anchors` должен быть доступен сразу после `stage_0_canon`, независимо от проверки `Canon vs шкалы`.

### Manual editors

Во frontend есть ручное редактирование:

- `anchors_timeline`
- `fact_bank`

После ручной правки UI может заново вызвать:

- `stage_3_blocks`
- `stage_4_qc`

Если переносится только backend, а frontend остаётся, новый backend обязан сохранить этот контракт.

## ENV и runtime-конфиги

Минимальный набор env для переноса:

```env
PORT=3001
BESCO_CORS_ORIGINS=http://localhost:4200,http://localhost:5173
BESCO_GEMINI_API_KEY=...
BESCO_GEMINI_MODEL_PRO=gemini-2.5-pro
BESCO_GEMINI_MODEL_FLASH=gemini-2.5-flash
BESCO_GEMINI_ENDPOINT_MODE=vertex
BESCO_GEMINI_API_BASE=https://aiplatform.googleapis.com
BESCO_GEMINI_API_VERSION=v1/publishers/google
BESCO_REQUEST_TIMEOUT_SEC=420
```

Дополнительно можно использовать:

- `BESCO_GEMINI_API_KEYS`
- `BESCO_GEMINI_ACCESS_TOKEN`
- `BESCO_GEMINI_GENERATION_CONFIG`

## Docker runtime

Текущая схема docker-compose:

- `backend` публикуется на `3001:3001`
- `frontend` публикуется на `4200:80`
- frontend зависит от backend
- backend читает env из `./backend/.env`

Если новый разработчик переносит систему в другой repo, проще всего сначала повторить именно эту двухсервисную схему.

## Пошаговый план переноса

### Шаг 1. Зафиксировать внешний контракт

Перед переносом нужно сохранить без изменений:

- route names
- request fields
- response fields
- `pipeline_state`
- `generation_type`
- `fact_extension_packages`
- `stage_prompts`

Если контракт меняется, нужно одновременно менять frontend.

### Шаг 2. Перенести нормализацию входного `person`

Нужно перенести весь смысл `normalizeIncomingPerson`:

- support плоской схемы
- support `generalInfo.*`
- вычисление `birth_year`
- вычисление `age`
- разбор `country` вида `"Country, City"`
- normalizing `job`, `education`, `children`

Это критический шаг. Именно здесь чаще всего "теряются" возраст, география, ребёнок и другие факты.

### Шаг 3. Перенести `stage_0_canon`

Нужно воспроизвести:

- локальный build canon
- build top traits
- начальный `pipeline_state`
- `finishReason=PIPELINE_STAGE_0_READY`

Этот этап не должен ходить в LLM.

### Шаг 4. Перенести prompt builder'ы

Нужно перенести не только дефолтные user prompt'ы, а полный backend shell:

- `buildCanonConsistencyPrompt`
- `buildStage1Prompt`
- `buildStage2Prompt`
- `buildStage3Prompt`
- `buildStage4Prompt`

Особенно важно сохранить:

- JSON schema инструкцию
- explicit retention rules
- передачу `Canon JSON`, `Anchors JSON`, `Fact bank JSON`
- block spec / qc spec

### Шаг 5. Перенести Gemini adapter

Нужно повторить:

- выбор `type-pro` / `type-flash`
- endpoint mode `gemini` / `vertex`
- api key vs bearer token
- deterministic key rotation по `requestId`
- `responseMimeType=application/json`
- stage-specific timeout override

### Шаг 6. Перенести stage execution и state invalidation

Нужно сохранить, что:

- после `stage_1_anchors` сбрасываются fact bank, blocks, qc
- после `stage_2_fact_bank` сбрасываются blocks, qc
- после `stage_3_blocks` сбрасывается старый qc

Если это не перенести, пользователю будут показываться устаревшие downstream данные.

### Шаг 7. Перенести `check-canon-consistency`

Обязательно перенести как отдельный use case:

- самостоятельный endpoint
- heuristic + Gemini merge
- optional execution
- запись результата в `pipeline_state.pipeline_meta`

Нельзя превращать это в обязательный gate перед stage 1.

### Шаг 8. Перенести output shaping

Нужно повторить `toLegendResponseJson`, чтобы сохранить:

- `short_summary`
- `life_story`
- `legend`
- `legend_blocks`
- `legend_v1_final_json`
- `anchors`
- `fact_bank_stats`
- `blocks_report`
- `qc_report`
- `pipeline_state`

### Шаг 9. Перенести frontend integration

Если переносится и frontend, разработчик должен повторить:

- `buildBasePayload`
- stage-specific `pipeline_state`
- request timeout logic
- optional consistency check
- manual editor flow
- dev/prod API URL resolution

### Шаг 10. Добавить post-migration тесты

Минимальный smoke set:

1. `stage_0_canon` на JSON с `generalInfo.dateBirth` и `generalInfo.country`
2. `stage_1_anchors` сразу после `stage_0_canon`, без consistency check
3. `check-canon-consistency` после `stage_0_canon`
4. `stage_2_fact_bank` на описании, где есть ребёнок и питомцы
5. `stage_3_blocks` после ручной правки facts
6. `stage_4_qc` после сборки блоков

## Acceptance criteria после переноса

Новый сервис считается перенесённым корректно, если:

- UI может выполнить `Canon -> Якоря -> Факты -> Блоки -> QC`
- проверка `Canon vs шкалы` работает отдельно и не блокирует якоря
- данные из `generalInfo.*` не теряются
- факт наличия ребёнка и питомцев из `description` доезжает до anchors и fact bank
- `fact_extension_packages=1` увеличивает target facts до `210`
- `generation_type=type-flash` реально переключает модель на flash
- при падении Gemini в consistency check остаётся heuristic fallback
- ответы модели продолжают парситься как JSON без постобработки "по тексту"

## Что лучше улучшить уже после переноса

Это не обязательно для parity, но полезно:

- убрать дублирование дефолтных prompt'ов между backend и frontend
- добавить лог размера prompt в токенах
- добавить `maxOutputTokens` по этапам
- добавить snapshot tests на prompt builder'ы
- добавить schema validation на ответы LLM до нормализации
- вынести prompt templates в отдельные versioned files

## Краткая памятка для разработчика

Если нужно перенести систему быстро и без потери поведения, порядок такой:

1. Скопировать HTTP контракт и `pipeline_state`
2. Скопировать `normalizeIncomingPerson`
3. Скопировать `stage_0_canon`
4. Скопировать все backend prompt builder'ы
5. Скопировать Gemini adapter с auth/model/timeout/key-rotation
6. Скопировать invalidation logic между этапами
7. Скопировать optional consistency check
8. Прогнать smoke cases на ребёнке, питомцах, `generalInfo.dateBirth`, `type-flash`

Если хотя бы один из этих пунктов будет пропущен, перенос будет выглядеть "почти рабочим", но начнёт терять факты, ломать UI или давать другой output.
