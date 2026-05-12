# Memory Service Workflow

Этот документ относится к ветке `update_front` репозитория `profile-legend-gen-`.

`memory-service/` - отдельный NestJS сервис для загрузки Besocial диалога, нормализации заметок, построения memory chunks, записи в Supabase pgvector и выдачи релевантной памяти в генерацию ответов.

Существующий `backend/` в этой ветке остаётся Express API для генерации легенды. Он не заменён и не смешан с memory workflow.

## Сервис и маршруты

Локально сервис слушает `PORT`, по умолчанию `3001`. В Docker compose он поднят отдельно на `3002`, чтобы не конфликтовать с Express backend.

Основные endpoints:

```text
GET  /api/health
GET  /api/supabase/health
GET  /api/memory/status
POST /api/dialog/full-info
POST /api/memory/ingest
POST /api/memory/search
POST /api/analyze/photo
POST /api/analyze/context
POST /api/assistant/workflow
```

В Docker:

```text
http://localhost:3002/api/health
```

## Основной поток

1. Оператор или интеграция вызывает `POST /api/dialog/full-info`.
2. `memory-service` делает `POST` во внешний Besocial API:

```text
https://test-api.besocial.tech/chathouse/favorites/getFullDialogInfo
```

3. Сервис возвращает `conversationJson`, `profileJson`, `photoUrl`, `messageCount`, `aiNotesCount`.
4. После успешной загрузки сервис автоматически вызывает memory ingest.
5. Память режется на chunks и сохраняется в Supabase `public.client_memory_chunks`.
6. При `Analyze Context` или `Generate Reply/Letter` сервис ищет релевантные chunks через RPC `match_client_memory_chunks`.
7. Если Supabase вернул chunks, они заменяют локальный memory context в prompt.

## Payload нормализация

Функция:

```text
prepareInputs()
```

Она делает:

- достаёт профиль из `conversationJson` или отдельного `profileJson`;
- собирает `aiNotes`, `manualNotes`, `notes` из всех поддержанных путей;
- достаёт сообщения из `allMessages` или `messages`;
- убирает пустые и system messages;
- сортирует по `sent_at`;
- находит последние incoming/outgoing;
- строит balanced recent window: последние 5 incoming + последние 5 outgoing;
- строит локальный memory context как fallback.

Заметки объединяются, а не выбираются по первому найденному полю.

## Memory chunks

Функция:

```text
buildMemoryChunks()
```

Типы chunks:

- `profile` - имя, возраст, город, страна, цели, хобби, traits;
- `note` - AI/manual/operator notes;
- `conversation` - короткие сообщения;
- `letter` - длинные сообщения или messages с letter-like type/format.

Каждый chunk получает `source`, `source_id`, дату, текст, embedding и `content_hash`.

## dialog_key

Память изолируется по паре:

```text
woman_id + client_id
```

Ключ строится так:

```text
dialog_key = sha256("dialog:" + woman_id + ":" + client_id)
```

Это не даёт подтянуть факты другого клиента или другой девушки/оператора.

## Supabase

Миграция лежит здесь:

```text
memory-service/supabase/migrations/202604300001_client_memory_chunks.sql
```

Таблица:

```text
public.client_memory_chunks
```

Dedupe:

```text
unique(dialog_key, content_hash)
```

Повторная загрузка того же диалога не плодит дубли, а новые сообщения и заметки добавляются.

RPC:

```text
match_client_memory_chunks(...)
```

RPC делает hard filter по `dialog_key`, optional filter по `client_id`, фильтр по compose mode, cosine similarity, source weights и recency boost.

## Reply vs Letter

`reply`:

- короткий формат;
- сильнее использует latest exchange и recent tone;
- бустит conversation и latest incoming.

`letter`:

- 3-5 коротких абзацев;
- сильнее бустит notes и previous letters;
- не должен копировать старые outgoing letters.

## Запуск

Установить зависимости:

```bash
npm run install:memory
```

Создать `.env`:

```bash
cp memory-service/.env.example memory-service/.env
```

Запуск локально:

```bash
npm run dev:memory
```

Docker:

```bash
docker compose up -d --build memory-service
```

Проверка:

```bash
curl http://localhost:3002/api/health
```

## Environment

```env
PORT=3002
BESCO_MODEL_PROVIDER=gemini
BESCO_XAI_API_KEY=
BESCO_DIALOG_INFO_API_URL=https://test-api.besocial.tech/chathouse/favorites/getFullDialogInfo
BESCO_GEMINI_API_KEY=
BESCO_GEMINI_MODEL=gemini-2.5-flash
BESCO_GEMINI_ENDPOINT_MODE=gemini
BESCO_XAI_MODEL=grok-4.20-reasoning
BESCO_SUPABASE_URL=
BESCO_SUPABASE_PUBLISHABLE_KEY=
BESCO_SUPABASE_SERVICE_ROLE_KEY=
BESCO_WOMAN_ID=default-operator
```
