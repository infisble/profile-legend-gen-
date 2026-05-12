# Profile gen

Монорепозиторий для поэтапной генерации биографической легенды/профиля от первого лица.

Документация пересобрана по ветке `origin/update_front`. В этой ветке backend остаётся Node/Express staged pipeline, а frontend уже React/Vite и его API-клиент переведён на внешний wrapped API вида `/ai/legend/...`.

## Структура

- `backend/` - Node.js + Express + TypeScript backend.
- `frontend/` - React 18 + Vite frontend, локально порт `4200`.
- `docs/TRANSFER_GUIDE.md` - подробная документация по архитектуре, API, state и переносу.
- `docker-compose.yml` - локальный запуск backend + frontend.

## Основной pipeline

Генерация идёт по этапам и передаёт состояние через `pipeline_state`:

1. `stage_0_canon` - нормализация `person` и шкал в `canon`, без LLM.
2. `stage_1_anchors` - генерация 8-12 поворотных anchors.
3. `stage_2_fact_bank` - генерация fact bank, базовая цель `160` фактов плюс `60` за каждый extension package.
4. `stage_3_blocks` - генерация `legend_blocks`, `legend_full_text` и dating-site текстов.
5. `stage_4_qc` - финальные проверки качества.

Все этапы после `stage_0_canon` требуют `pipeline_state` из предыдущего ответа.

## Важный контракт ветки `origin/update_front`

Ветка содержит важное расхождение frontend/backend:

- Встроенный backend отдаёт прямые endpoints:
  - `GET /api/health`
  - `GET /api/template`
  - `POST /api/generate-profile`
  - `POST /api/check-canon-consistency`
  - `POST /api/translate-output`
- Обновлённый frontend вызывает wrapped endpoints:
  - `POST /ai/legend/generate-profile`
  - `POST /ai/legend/check-canon-consistency`
  - `POST /ai/legend/translate-output`
- Обновлённый frontend ожидает оболочку:

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

Если запускать обновлённый frontend с backend из этого же репозитория, нужен adapter/proxy: он должен маппить `/ai/legend/*` на `/api/*` и заворачивать прямой JSON backend в поле `data`. Другой вариант - вернуть frontend на прямой контракт `/api/*`.

## Быстрый старт

Установить зависимости:

```bash
npm install
npm run install:all
```

Запустить frontend и backend:

```bash
npm run dev
```

Локальные адреса:

- frontend: `http://localhost:4200`
- backend: `http://localhost:3001`

Сборка:

```bash
npm --prefix backend run build
npm --prefix frontend run build
```

Docker:

```bash
docker compose up -d --build
```

## Переменные окружения

Backend читает `.env` из `backend/.env` или из корня репозитория.

Основные переменные:

```env
PORT=3001
BESCO_CORS_ORIGINS=http://localhost:4200,http://localhost:5173
BESCO_GEMINI_API_KEY=...
BESCO_GEMINI_MODEL_PRO=gemini-2.5-pro
BESCO_GEMINI_MODEL_FLASH=gemini-2.5-flash
BESCO_GEMINI_ENDPOINT_MODE=gemini
BESCO_REQUEST_TIMEOUT_SEC=420
```

Опциональный xAI routing для sexuality-heavy override:

```env
BESCO_XAI_API_KEY=...
BESCO_XAI_FOR_SEXUAL_CONTENT=true
```

## Пример запроса

```json
{
  "run_stage": "stage_0_canon",
  "generation_type": "type-pro",
  "stage_3_output_mode": "both",
  "fact_extension_packages": 0,
  "person": {
    "name": "Alina",
    "birth_date": "1994-08-17",
    "current_location": {
      "country": "Poland",
      "city": "Warsaw",
      "since": "2022"
    },
    "relationship_status": "single, looking for a relationship"
  },
  "personality_profile": {
    "responsibility": 8,
    "achievement_drive": 9,
    "empathy": 6,
    "discipline": 7,
    "independence": 8,
    "emotional_stability": 5,
    "confidence": 7,
    "openness_to_change": 9,
    "creativity": 8,
    "sexual_expressiveness": 6,
    "dominance_level": 5,
    "wealth": 6,
    "health": 7,
    "social_connection": 8,
    "mission_level": 7,
    "partner_seek_drive": 6
  },
  "stage_prompts": {
    "stage_1_anchors_prompt": "Generate anchors with concrete dates and no canon contradictions."
  }
}
```

## Что читать в ответе

`result.parsedJson` содержит:

- `short_summary`
- `legend_full_text`
- `dating_site_texts`
- `legend` / `legend_blocks` / `legend_v1_final_json`
- `anchors`
- `fact_bank_stats`
- `blocks_report`
- `qc_report`
- `pipeline_state`

Для следующего этапа нужно передавать `pipeline_state` из предыдущего ответа.
