# ChinaCalcRu — калькулятор товаров из Китая

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-success" alt="status"/>
  <img src="https://img.shields.io/badge/Cloudflare-Pages%20Functions-orange" alt="cf-pages"/>
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="license"/>
</p>

Небольшое SPA для расчёта итоговой стоимости товаров с учётом курса CNY→RUB и вариантов доставки.

Данные и чат ИИ сохраняются в общем облачном KV (Cloudflare Pages Functions), а доступ к приложению и API защищён общим ключом (cookie‑сессия).

## Содержание
- [Возможности](#возможности)
- [Демо](#демо)
- [Скриншот](#скриншот)
- [Структура проекта](#структура-проекта)
- [Быстрый старт (локально)](#быстрый-старт-локально)
- [Деплой на Cloudflare Pages](#деплой-на-cloudflare-pages)
- [API](#api)
- [Разработка](#разработка)
- [Дорожная карта](#дорожная-карта)
- [Лицензия](#лицензия)

## Возможности
- Инлайн‑редактирование вариантов доставки:
  - Базовая плата, цена за кг, минимальное списание, минимальный вес, описание.
- Список товаров: название, ссылка, вес, количество, цена (CNY), выбор доставки, итог (RUB).
- Мгновенный пересчёт и автосохранение (индикатор: сохранение/сохранено/ошибка).
- Экспорт в Excel (xlsx) с расширенными колонками и гиперссылками.
- Вкладка «ИИ» (Claude):
  - Текстовые запросы и изображения (анализ фото).
  - Общий чат для всех пользователей (хранится в KV, единая история).
  - ИИ может предлагать изменения данных в виде JSON; применяется только после подтверждения.
- Общая аутентификация: вход по ключу, сессионная cookie; защищены все API.

## Демо
- Production URL: Cloudflare Pages (после деплоя).

## Скриншот
<p align="center">
  <img src="docs/screenshot.png" alt="UI скриншот" width="820"/>
</p>

## Структура проекта
```
.
├─ index.html                 # Разметка + подключение фронтенда
├─ styles.css                 # Стили + вкладки
├─ scripts/
│  └─ app.js                 # Логика UI, автосохранение, вкладка ИИ, чат, логин
└─ functions/
   └─ api/
      ├─ data.js             # GET/PUT /api/data — общий датасет (KV)
      ├─ ai.js               # POST /api/ai — прокси к Anthropic Claude (+ rate limit)
      ├─ auth.js             # GET/POST /api/auth — логин по ключу, cookie‑сессия
      └─ chat.js             # GET/PUT/DELETE /api/chat — общий чат в KV
```

## Быстрый старт (локально)
Фронтенд статический, но для работы сохранения/чата/ИИ нужен бэкенд (Pages Functions).

Варианты:
- Открыть `index.html` для быстрой проверки UI (без бэкенда функции недоступны).
- Развернуть на Cloudflare Pages (ниже) — рекомендовано.

## Деплой на Cloudflare Pages
1) Проект Pages
- Dashboard → Pages → Create project → Connect to Git.
- Build command: — (не требуется)
- Output directory: `.`

2) KV Namespace
- Workers & KV → Create Namespace → Name: `ChinaCalcKV`

3) Привязка KV к Pages Functions
- Pages → ваш проект → Settings → Functions → KV namespaces → Add binding:
  - Variable name: `KV`
  - Namespace: `ChinaCalcKV`

4) Переменные окружения (Pages → Settings → Environment variables)
- `ACCESS_KEY` — общий ключ доступа (обязательно для защиты)
- `ANTHROPIC_API_KEY` — ключ Anthropic Claude

5) (Опционально) Cloudflare Access
- Zero Trust → Access → правила для домена Pages (`/api/*`).

После деплоя откройте сайт: появится форма входа по ключу. После входа — единые данные и общий чат ИИ будут доступны всем пользователям.

## API
Все эндпоинты требуют сессионную cookie `SESSION=1` (устанавливается через `/api/auth`). Если `ACCESS_KEY` не задан, доступ открыт.

- `/api/auth`
  - GET → `{ authenticated: boolean }`
  - POST `{ key }` → при совпадении `ACCESS_KEY` ставит cookie сессии, возвращает `{ authenticated: true }`

- `/api/data`
  - GET → `{ currencyRate, deliveryOptions, products }` — общий датасет (KV key `global`)
  - PUT → сохраняет тот же объект в KV

- `/api/chat`
  - GET → `{ items: [...] }` — общая история чата (KV key `chat:global`)
  - PUT `{ items }` → перезапись истории
  - DELETE → очистка истории

- `/api/ai`
  - POST `{ text, system, image? }` → прокси к Anthropic Claude
  - Поддерживает изображение (base64), ответ в Markdown; настроен whitelist моделей и rate‑limit на IP (через KV).

## Разработка
- Без сборщиков, чистый HTML/CSS/JS.
- SheetJS CDN для экспорта XLSX.

### Идеи для улучшений
- Улучшить UX логина: показать ошибки, кнопка «Выйти», авто‑редирект по истечении cookie.
- Роли/права (read‑only / editor) для общего датасета.
- История изменений (аудит) в KV с метаданными и возможностью отката.
- Стриминг ответов ИИ (SSE) и индикатор «печатает…».
- Больше валидаций и подсветка ошибок ввода.
- Импорт/экспорт JSON состояния; шаблоны для быстрых стартовых пресетов.
- PWA: offline‑кеш фронтенда и фоллбек локального хранения при недоступности KV.
- Тесты (UI e2e и unit), ESLint/Prettier, CI.

## Дорожная карта
- Сводные отчёты по вариантам доставки.
- Групповые операции по товарам.
- Автообновление курса CNY→RUB через внешний API.

## Лицензия
MIT
