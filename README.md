# Neutrons

Neutrons - это веб-приложение для поэтапной генерации подробной биографической "легенды" персонажа. Пользователь вводит анкету, настраивает 16 личностных шкал, запускает этапы генерации и получает anchors, fact bank, готовые текстовые блоки, полный текст, тексты для dating profile и QC-отчёт.

Эта документация относится к ветке `update_front` / `origin/update_front`, не к `main`.

## Что лежит в проекте

- `frontend/` - React 18 + Vite интерфейс. Локально открывается на `http://localhost:4200`.
- `backend/` - Node.js + Express + TypeScript API. Локально слушает `http://localhost:3001`.
- `memory-service/` - отдельный NestJS сервис для Besocial dialog memory, Supabase pgvector и генерации replies/letters. В Docker слушает `http://localhost:3002`.
- `docs/TRANSFER_GUIDE.md` - подробная инструкция по проекту, endpoints, pipeline, payloads, state и запуску.
- `docs/MEMORY_SERVICE_WORKFLOW.md` - workflow memory-сервиса, endpoints, Supabase table/RPC и запуск.
- `docker-compose.yml` - запуск frontend и backend в Docker.

## Как это работает простыми словами

Представьте конвейер из пяти станций. На первой станции система приводит анкету к понятному виду. На второй придумывает важные жизненные повороты. На третьей раскладывает жизнь на много маленьких фактов. На четвёртой собирает из фактов готовые тексты. На пятой проверяет, нет ли ошибок и противоречий.

Эти станции называются:

1. `stage_0_canon` - собрать базовую правду о персонаже.
2. `stage_1_anchors` - создать 8-12 ключевых жизненных событий.
3. `stage_2_fact_bank` - создать подробный банк фактов.
4. `stage_3_blocks` - собрать тексты легенды.
5. `stage_4_qc` - проверить качество.

После каждого этапа backend возвращает `pipeline_state`. Его нужно отправлять в следующий этап. Без него система не знает, что уже было сгенерировано.

## Важный нюанс ветки `update_front`

В этой ветке frontend ожидает внешний API в формате:

- `POST /ai/legend/generate-profile`
- `POST /ai/legend/check-canon-consistency`
- `POST /ai/legend/translate-output`

И ждёт ответ в оболочке:

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

Встроенный backend этого репозитория отдаёт прямые endpoints:

- `GET /api/health`
- `GET /api/template`
- `POST /api/generate-profile`
- `POST /api/check-canon-consistency`
- `POST /api/translate-output`

Если запускать frontend из этой ветки с bundled backend напрямую, нужен adapter/proxy между `/ai/legend/*` и `/api/*`.

## Быстрый запуск

Установить зависимости:

```bash
npm install
npm run install:all
npm run install:memory
```

Запустить backend и frontend:

```bash
npm run dev
```

Запустить memory-service отдельно:

```bash
npm run dev:memory
```

Проверить backend:

```bash
curl http://localhost:3001/api/health
curl http://localhost:3002/api/health
```

Docker:

```bash
docker compose up -d --build
```

## Основные endpoints

Кратко:

- `GET /api/health` - проверить, что backend жив.
- `GET /api/template` - получить шаблоны анкеты, шкал, prompts и блоков.
- `POST /api/generate-profile` - главный endpoint генерации по stages.
- `POST /api/check-canon-consistency` - проверить, не спорит ли анкета со шкалами.
- `POST /api/translate-output` - перевести готовые тексты, facts или anchors.

Подробные request/response примеры и порядок работы описаны в [docs/TRANSFER_GUIDE.md](docs/TRANSFER_GUIDE.md).

## Минимальный порядок работы с API

1. Вызвать `POST /api/generate-profile` с `run_stage = "stage_0_canon"`.
2. Взять `result.parsedJson.pipeline_state`.
3. Передать этот `pipeline_state` в `stage_1_anchors`.
4. Повторить то же для `stage_2_fact_bank`, `stage_3_blocks`, `stage_4_qc`.
5. Если нужен перевод, вызвать `POST /api/translate-output`.

Главное правило: каждый следующий stage должен получить актуальный `pipeline_state` из предыдущего stage.
