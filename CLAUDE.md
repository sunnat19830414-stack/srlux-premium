# SR Lux Premium — история проекта и известные грабли

E-commerce платформа с интеграцией ERP **Dolibarr**. Backend: FastAPI + SQLAlchemy 2.0 async + PostgreSQL.
Frontend: React + TypeScript + Vite + Tailwind. Reverse proxy: nginx. Repo: github.com/sunnat19830414-stack/srlux-premium.
Продакшен: srlux.uz, контейнеры `srlux-web` / `srlux-api` / `srlux-nginx` / `srlux-postgres` / `srlux-redis` (+ pm2 процесс `srlux`).

Составлено автоматически из `git log` (64 коммита, 2026-05-24 → 2026-07-05) по запросу пользователя,
чтобы будущие сессии Claude Code сразу видели контекст без повторного разбора истории.
Этот файл — сжатая выжимка. Полные диалоги (что пробовали до финального фикса) хранятся локально
на ПК пользователя в `~/.claude/projects/.../session_01HLpfzWgs5g34ZS5yj7G4N1*.jsonl` — здесь их нет.

## Архитектура (сложилась поэтапно)

1. Первая версия: FastAPI + Dolibarr sync, React фронт (коммит `feb1fa7`).
2. Полная переработка по ТЗ (`667b874`): SQLAlchemy 2.0 async + Postgres, роутеры products/categories/orders,
   Telegram-уведомления о заказах, gold/anthracite Tailwind-тема, LocaleContext (RU/UZ).
3. Каталог эволюционировал от плоского списка товаров к **архитектуре "модель → варианты"** (`7210bf6`, `13e5b9c`):
   товары группируются в карточки моделей (`parent_model`), у каждой модели — цвета/секции/варианты.
   Model-card товары в Dolibarr (label вида `"GZ2/G2T — трубчатый 2-колонный"`) сами скрыты (`is_active=False`),
   используются только как источник alias→canonical_ref маппинга.
4. Admin-панель выросла в 3 захода: базовый CRUD (`8319a96`) → UX-доработка v2 с тостами/confirm-модалками/
   сортировкой/поиском (`6750f65`) → категории со стилями отображения и sort_order (`e5d2b30`).

## Известные грабли и как решены

### Dolibarr API — сюрпризы
- `price_base_type` возвращает `"TTC"/"HT"`, это НЕ код валюты — не путать с валютой заказа.
  Курс берётся из `DOLIBARR_DEFAULT_CURRENCY` + `USD_TO_UZS_RATE` env-переменных.
- Цена иногда лежит не в `price_ttc`, а только в `multiprices_ttc[level]` — при `price_ttc == 0`
  нужен fallback-перебор по multiprices_ttc/multiprices (`024f149`).
- У товара часто пустой `category_ids` — категории приходится подтягивать через
  `GET /categories?type=product&object_id={pid}` по каждому товару отдельно (`b2c123d`).
- Итог: от автосинка категорий вообще отказались — категории теперь **ручные**
  (`setup_categories.py`, keyword-матчинг по названию/SKU), синк их больше не перезаписывает (`8609dea`).
- Фото из Dolibarr ненадёжны: поле `photos` не всегда отдаёт данные → fallback на
  `GET /documents?modulepart=product&id={id}` (`6b5be50`); иногда в Dolibarr вообще левые фото
  (наушники, дрели вместо радиаторов) — было временно отключено (`20bddd5`), затем включено обратно,
  т.к. фото стали вести прямо в Dolibarr (`9639c09`).
- Имена файлов с пробелами ломали скачивание через viewimage.php — нужен URL-encode (`7e155e8`).
- Защита от перезаписи вручную загруженных фото: флаг `image_manual` — синк не трогает такие товары (`13c182e`).
- Если у дочернего товара нет фото/описания — наследуется от родителя `fk_product_parent` (`e2779ff`).

### Docker/nginx — таймінги контейнеров
- nginx падал при старте, если api/web ещё не зарегистрированы в Docker DNS →
  добавлен `resolver 127.0.0.11` (`3363bef`), а затем ещё надёжнее: `proxy_pass` через `set $var`
  для ленивого резолвинга хоста на момент запроса, а не старта nginx (`accd984`).
- Sync-скрипт при старте контейнеров получал Connection refused → теперь поллит `/health`
  перед первым запросом к backend (`7c1a227`).

### Безопасность (OWASP-проход, `a476cd1`)
Убраны все дефолтные секреты и fallback-креды, rate-limit на `/api/admin/` (3r/m, позже расширен до 30r/m
из-за легитимных параллельных запросов панели — `f8a55c7`), CORS сужен, добавлены CSP/HSTS/Referrer-Policy/
Permissions-Policy заголовки (сначала положили в `http{}` блок nginx — не сработало надёжно, перенесли
в `server{443}` — `20bddd5`), DOMPurify на HTML-описания от Dolibarr (XSS), лимит размера тела запроса,
generic 401 вместо утечки сообщений об ошибке.

### AI-обработка фото товаров (`tools/smart_photo_processor.py`)
Долгий путь проб и ошибок с генерацией цветовых вариантов товара:
- Сначала numpy luminance-based перекраска (работала только с белым фоном, потом исправлено под любой
  исходный цвет — нормализация яркости перед перекраской, `106d570`).
- Попытка подключить **Claid.AI** — серия из 7 неудачных фиксов подряд (`c5b26d3` → `619ecb2`):
  менялись эндпоинты (`/v1-beta1/assets` 404 → `/v1-beta1/image/ai-edit`), формат тела (multipart → base64 JSON →
  снова multipart), формат input (`{"url": ...}` vs bare string). Для передачи фото Claid.AI нужен публичный URL:
  file.io блокирует автоматические запросы → переключились на catbox.moe/0x0.st/tmpfiles.org (`bd87b7a`).
- В итоге Claid.AI заброшен, основной путь — **Photoroom API** (`68d2c3d`), с fallback на локальный
  numpy-recolor если API недоступен. Есть ещё локальный `--bg` режим — композитинг на брендовый фон
  через PIL без обращения к внешним API (`d720a8f`).
- Вывод на будущее: если снова понадобится AI-фотообработка — начинать сразу с Photoroom, не с Claid.AI.

### Frontend/build
- `npm ci` падал в Docker-сборке → заменено на `npm install` (`d65e5cb`).
- TS-ошибки с типом иконок решены через `ComponentType<any>`, `tsc` пропущен в build-шаге (`9e28155`).
- `GZIPMiddleware` — сначала пытались импортировать из FastAPI, потом из starlette, в итоге убрали совсем:
  сжатием занимается nginx (`8fcccc0`, `c92b610`).

## Если продолжаете работу
- Все правки в `erp_sync_dolibarr.py` — самый "минный" файл проекта, много `.bak`-версий рядом с ним
  говорят о частой ручной отладке синка. Перед новыми изменениями стоит прогнать
  `backend/diag_dolibarr_structure.py` для диагностики иерархии товаров.
- `.bak*` файлы в `backend/` — это снапшоты промежуточных версий (crud.py, main.py, models.py, schemas.py,
  erp_sync_dolibarr.py). Можно чистить, если не нужны для истории отладки.
