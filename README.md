# History Tracker

Сервис для совместного просмотра истории посещений через каналы по аналогии с Telegram. Состоит из REST API на ASP.NET Core 9 и браузерного расширения (Manifest V3) для Chromium-браузеров.

## Содержание

- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Стек технологий](#стек-технологий)
- [Структура репозитория](#структура-репозитория)
- [Запуск](#запуск)
- [API](#api)
- [Тестирование](#тестирование)

## Возможности

- Регистрация / логин по username + password, авторизация по Bearer-токену, ротация токена.
- Каналы двух типов:
    - **Public** — содержимое доступно всем; присоединиться может любой через `subscribe`.
    - **Private** — видно только владельцу и приглашённым участникам, владелец добавляет их по username.
- Текстовые посты в каналах (CRUD, лента).
- Автопостинг визитов из браузера: расширение фиксирует посещение страницы и отправляет URL в выбранные пользователем каналы.
- Чёрный список доменов и дебаунс повторных визитов (60 секунд).
- Просмотр чужих визитов: на любой странице рядом со ссылками подсвечиваются те URL, которые посетили подписки текущего пользователя, с тултипом «кто, в каком канале, когда».
- Лента канала с переключателем «Всё / Посты / Визиты».
- Изоляция аккаунтов на уровне окна браузера — в разных окнах можно быть разными пользователями.
- Нормализация URL.

## Архитектура

Проект разбит на три слоя:

- **Core** — доменные сущности (`User`, `Channel`, `ChannelMember`, `Visit`, `Post`) и сервисы без зависимостей от инфраструктуры (`UrlNormalizer`).
- **Data** — `AppDbContext`, конфигурация EF Core, миграции, маппинг в snake_case.
- **Api** — Minimal API endpoints, кастомная аутентификация по Bearer-токену (`ApiTokenAuthenticationHandler`), Swagger, Serilog.

## Стек технологий

| Слой             | Технология                                                          |
| ---------------- | ------------------------------------------------------------------- |
| Backend          | ASP.NET Core 9, Minimal API                                         |
| ORM              | Entity Framework Core 9, Npgsql                                     |
| База             | PostgreSQL 16 (Docker)                                              |
| Auth             | Bearer ApiToken (свой `AuthenticationHandler`), BCrypt для паролей  |
| Логи             | Serilog                                                             |
| Документация API | Swagger / OpenAPI                                                   |
| Тесты            | xUnit, Testcontainers (реальный Postgres в Docker)                  |
| Расширение       | JavaScript ES Modules, Manifest V3, MutationObserver, webNavigation |

## Структура репозитория

```
history_tracker/
├── backend/
│   ├── HistoryTracker.sln
│   ├── docker-compose.yml          # Postgres на :5433
│   ├── src/
│   │   ├── Core/                   # доменные сущности и сервисы
│   │   ├── Data/                   # AppDbContext + миграции
│   │   └── Api/                    # endpoints, auth, Program.cs
│   └── tests/
│       ├── UnitTests/              # UrlNormalizer и пр.
│       └── IntegrationTests/       # Testcontainers + реальный API
├── extension/
│   ├── manifest.json
│   ├── background.js               # service worker, дебаунс, постинг визитов
│   ├── content.js                  # подсветка ссылок, бейджи, тултип
│   ├── url_normalizer.js           # зеркало Core/Services/UrlNormalizer.cs
│   ├── popup.{html,js,css}         # логин, каналы, выбор автопоста
│   ├── feed.{html,js,css}          # лента канала с фильтром
│   ├── api.js                      # обёртка над fetch
│   └── config.js                   # per-window storage helpers
├── .gitignore
└── README.md
```

## Запуск

### Требования

- .NET 9 SDK (`dotnet --version` → 9.x)
- Docker Desktop
- Chromium-браузер с поддержкой MV3 (Chrome / Edge / Brave)

### 1. База данных

```bash
cd backend
docker compose up -d db
```

Контейнер `history_db` слушает `localhost:5433`. Логин/пароль — `history` / `history`.

### 2. API

```bash
cd backend
dotnet run --project src/Api
```

В Development-окружении миграции накатываются автоматически при старте. Сервис доступен на `http://localhost:5000`, Swagger UI — на `http://localhost:5000/swagger`.

### 3. Расширение

Клонируете папку extension, а затем открываете ее с помощью chrome://extensions/, где нажимаете на кнопку загрузить упакованное расширение; затем логин+пароль или регистрация и вы в системе

### Несколько аккаунтов

Токен хранится отдельно для каждого окна браузера. В одном окне можно быть `alice`, в другом — `bob`; визиты летят в каналы того пользователя, в чьём окне открыта вкладка.

## API

Все защищённые endpoints требуют заголовок `Authorization: Bearer <apiToken>`. Полный список — в Swagger UI.

### Auth

| Метод  | Путь                        | Описание                                          |
| ------ | --------------------------- | ------------------------------------------------- |
| `POST` | `/api/v1/auth/register`     | Регистрация, возвращает `apiToken`                |
| `POST` | `/api/v1/auth/login`        | Логин по username/password                        |
| `POST` | `/api/v1/auth/rotate-token` | Сгенерировать новый токен (старый инвалидируется) |

### Channels

| Метод    | Путь                                     | Описание                                                    |
| -------- | ---------------------------------------- | ----------------------------------------------------------- |
| `GET`    | `/api/v1/channels/my`                    | Свои каналы (owner + member)                                |
| `GET`    | `/api/v1/channels/public`                | Поиск публичных каналов                                     |
| `POST`   | `/api/v1/channels`                       | Создать канал (`visibility`: 0 = public, 1 = private)       |
| `PATCH`  | `/api/v1/channels/{id}`                  | Обновить канал (только владелец)                            |
| `DELETE` | `/api/v1/channels/{id}`                  | Удалить канал                                               |
| `POST`   | `/api/v1/channels/{id}/subscribe`        | Подписаться на публичный канал                              |
| `POST`   | `/api/v1/channels/{id}/members`          | Добавить участника в private (по username; только владелец) |
| `DELETE` | `/api/v1/channels/{id}/members/{userId}` | Удалить участника / отписаться                              |

### Visits & Posts

| Метод  | Путь                           | Описание                                                    |
| ------ | ------------------------------ | ----------------------------------------------------------- |
| `POST` | `/api/v1/visits`               | Записать визит в указанные каналы (только владелец каналов) |
| `GET`  | `/api/v1/channels/{id}/visits` | Лента визитов канала                                        |
| `POST` | `/api/v1/channels/{id}/posts`  | Опубликовать пост в канал                                   |
| `GET`  | `/api/v1/channels/{id}/posts`  | Лента постов канала                                         |

### Lookup

| Метод  | Путь                    | Описание                                           |
| ------ | ----------------------- | -------------------------------------------------- |
| `POST` | `/api/v1/lookup/by-url` | По массиву URL вернуть, кто из подписок их посещал |

## Тестирование

```bash
cd backend
dotnet test tests/UnitTests/UnitTests.csproj
dotnet test tests/IntegrationTests/IntegrationTests.csproj
```

- **UnitTests** — `UrlNormalizer`: lower-case хоста, срез `www.`, фрагмента, tracking-параметров, порядок query, стабильность хэша.
- **IntegrationTests** — Testcontainers поднимает отдельный `postgres:16-alpine`, прогоняет миграции, чистит таблицы между тестами через `TRUNCATE`. Покрывают auth (register / login / rotate / 401), channels (CRUD / visibility / subscribe / приватность), visits (только владелец постит, нормализация при сохранении), lookup (исключение себя, приватные каналы, матч по нормализованной форме, лимит 200 URL).

Для интеграционных тестов нужен запущенный Docker.
