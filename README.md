# Profile Generator (Legend TU v2)

Монорепо с полным циклом генерации жизненной легенды персонажа по ТЗ:

- `frontend/` — Angular UI: JSON-анкета, шкалы 1..10, stage prompts, регенерация этапов/блоков, QC-вывод.
- `backend/` — Node.js/Express API с детерминированным pipeline и поэтапной регенерацией.

## Pipeline

1. `stage_0_canon`
- нормализация входных данных (`person` + `personality_profile`)
- фиксация canon

2. `stage_1_anchors`
- генерация 8–12 якорей по сферам жизни

3. `stage_2_fact_bank`
- генерация `150 + N*60` атомарных фактов
- каждый факт = одно самостоятельное событие
- источники: `anchors` + `canon` + `period_logic`
- таймпривязка, сферы, hooks (15–30)

4. `stage_3_blocks`
- сборка жизненных блоков, сплошного текста или обоих форматов строго из фактов
- формат от первого лица

5. `stage_4_qc`
- 8 проверок качества: canon, timeline, непротиворечивость, проявление шкал, драмбаланс, hooks, шаблонность, стиль

## Регенерация

- `regenerate_stage`:
  - `stage_1_anchors`
  - `stage_2_fact_bank`
  - `stage_3_blocks`
  - `stage_4_qc`
- `regenerate_block`: перегенерация одного блока (`career_path`, `future_vector`, и т.д.)
- Важно: каждая регенерация выполняется отдельным `POST /api/generate-profile` и требует `pipeline_state` из предыдущего ответа.

## Quick start

1. Установить зависимости:

```bash
npm install
npm run install:all
```

2. Запустить frontend + backend:

```bash
npm run dev
```

### Docker (локально и на сервере)

1. Подготовить переменные backend:

```bash
cp backend/.env.example backend/.env
```

2. Для прод-сервера укажите в `backend/.env`:

```env
BESCO_CORS_ORIGINS=https://your-domain.com
```

Если `BESCO_CORS_ORIGINS` пустой, backend не будет ограничивать allowlist origin.

Для длинных этапов (`stage_1_anchors`, `stage_2_fact_bank`) рекомендуемый таймаут:

```env
BESCO_REQUEST_TIMEOUT_SEC=420
```

3. Запуск:

```bash
docker compose up -d --build
```

4. API:
- `GET /api/health`
- `GET /api/template`
- `POST /api/generate-profile`

## Пример запроса

```json
{
  "person": {
    "name": "Алина",
    "birth_date": "1994-08-17",
    "current_location": { "country": "Польша", "city": "Варшава", "since": "2022" },
    "relationship_status": "не замужем, свободна, открыта к отношениям с мужчиной"
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
  "stage_3_output_mode": "both",
  "fact_extension_packages": 0,
  "stage_prompts": {
    "stage_1_anchors_prompt": "Сгенерируй якоря без противоречий canon"
  }
}
```

## Ответ

`result.parsedJson` содержит:

- `short_summary`
- `life_story`
- `legend_full_text`
- `legend_blocks` (+ `legend_v1_final_json` для совместимости)
- `anchors`
- `fact_bank_stats`
- `qc_report`
- `pipeline_state`
