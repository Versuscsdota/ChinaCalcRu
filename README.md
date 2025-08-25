# ChinaCalcRu — калькулятор товаров из Китая

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active-success" alt="status"/>
  <img src="https://img.shields.io/badge/Cloudflare-Pages%20Functions-orange" alt="cf-pages"/>
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="license"/>
</p>

Небольшое SPA для расчёта итоговой стоимости товаров с учётом курса CNY→RUB и вариантов доставки. 
Данные автоматически сохраняются через Cloudflare Pages Functions + KV и восстанавливаются при открытии.

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
- Добавление и инлайн‑редактирование вариантов доставки:
  - Базовая плата, цена за кг, минимальное списание, минимальный вес, описание.
- Список товаров с полями: название, ссылка, вес, количество, цена в CNY, выбор доставки.
- Мгновенный пересчёт итоговой цены в RUB на позицию и общий итог.
- Автосохранение состояния с индикатором статуса: «Сохранение… / Сохранено / Ошибка сохранения».
- Экспорт в Excel (xlsx) с расширенными колонками:
  - Суммарный вес, цена товара (RUB), стоимость доставки (RUB), итоги по всем позициям.

## Демо
- Production URL: Cloudflare Pages (после деплоя).

## Скриншот
<p align="center">
  <img src="docs/screenshot.png" alt="UI скриншот" width="820"/>
</p>

## Структура проекта
```
.
├─ index.html                # UI + логика фронтенда (автосохранение, расчёты, экспорт)
└─ functions/
   └─ api/
      └─ data.js            # Pages Function: GET/PUT /api/data (Cloudflare KV)
```

## Быстрый старт (локально)
Проект статический, поэтому достаточно открыть `index.html` в браузере.
Для корректной загрузки/сохранения данных требуется бэкенд `/api/data` (см. деплой ниже) — иначе можно работать «офлайн», без облачного сохранения.

## Деплой на Cloudflare Pages
1) Создайте проект Pages
- Cloudflare Dashboard → Pages → Create project → Connect to Git (этот репозиторий).
- Build command: — (не требуется)
- Output directory: `.`

2) Создайте KV Namespace
- Workers & KV → Create Namespace → Name: `ChinaCalcKV`

3) Привяжите KV к Pages Functions
- Pages → ваш проект → Settings → Functions → KV namespaces → Add binding
  - Variable name: `KV`
  - Namespace: `ChinaCalcKV`

4) (Опционально) Защитите доступ Cloudflare Access
- Zero Trust → Access → Application → правила доступа для домена Pages (включая путь `/api/*`).

После деплоя — откройте сайт. Приложение подтянет сохранённые данные (если есть) и будет автоматически сохранять изменения.

## API
Бэкенд: `functions/api/data.js` → URL: `/api/data`

- GET `/api/data`
  - Возвращает JSON состояния: `{ currencyRate, deliveryOptions, products }`.
- PUT `/api/data`
  - Принимает JSON с теми же полями и сохраняет в KV (TTL по необходимости).
  - Заголовки: `Content-Type: application/json`.

По умолчанию используется единый ключ `global`. При необходимости можно перейти на персональные ключи (`user:<email>`) при интеграции с Cloudflare Access.

## Разработка
- Код максимально простой, без сборщиков.
- Экспорт XLSX — через SheetJS CDN.
- Рекомендации по улучшению:
  - Разнести код по файлам (`app.js`, `styles.css`).
  - Валидация вводов, форматирование чисел, маски.
  - Ретраи автосохранения (экспоненциальный backoff) + локальный фоллбек через `localStorage`.
  - PWA (offline‑кеш фронтенда).
  - ESLint + Prettier + GitHub Actions для проверки PR.

## Дорожная карта
- Импорт/экспорт JSON состояния (вдобавок к XLSX).
- Сводные итоги по вариантам доставки.
- Групповые операции по товарам.
- Обновление курса CNY→RUB через внешний API.

## Лицензия
MIT
