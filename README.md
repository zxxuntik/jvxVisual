# jvxVisual

Сайт и API для визуального мода Minecraft 1.21.11. Интерфейс написан на HTML, CSS и JavaScript, сервер работает на Node.js и Express, данные хранятся в PostgreSQL.

## Требования

- Node.js 20 или новее и npm.
- PostgreSQL 14 или новее.
- Собранный файл `jvxVisual.jar`, если нужна настоящая загрузка мода. Положи его в `public/downloads/jvxVisual.jar`.

Бинарный файл мода не включён в репозиторий: в проекте нет его исходников или готовой сборки. Остальные страницы, регистрация, API и админ-панель запускаются отдельно от JAR. Пока файл не добавлен, `/download` отвечает статусом `503` с объяснением.

## Установка и запуск

1. Установи зависимости из корня проекта:

   ```bash
   npm install
   ```

2. На Linux с systemd можно автоматически создать отдельную роль с именем текущего пользователя, базу и схему командой:

    ```bash
    npm run db:setup
    ```

    Скрипт попросит системный пароль через `sudo`, использует локальную peer-аутентификацию, применит `db/schema.sql` и создаст защищённый `.env` со случайными секретами. Если предпочитаешь отдельный пароль роли PostgreSQL или другой способ аутентификации, настрой базу вручную по шагам ниже.

    Создание вручную, например из оболочки `psql` от имени администратора PostgreSQL:

   ```sql
   CREATE USER jvxvisual WITH PASSWORD 'замени-на-длинный-пароль';
   CREATE DATABASE jvxvisual OWNER jvxvisual;
   ```

3. Примени схему к только что созданной базе:

   ```bash
   psql "postgresql://jvxvisual:замени-на-длинный-пароль@localhost:5432/jvxvisual" -f db/schema.sql
   ```

4. Создай локальный файл настроек и задай собственные секреты:

   ```bash
   cp .env.example .env
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Впиши в `.env` адрес базы и два **разных** значения, полученных командами выше:

   ```dotenv
   DATABASE_URL=postgresql://jvxvisual:замени-на-длинный-пароль@localhost:5432/jvxvisual
   JWT_SECRET=вставь-первый-секрет-минимум-32-символа
   IP_HASH_SECRET=вставь-другой-секрет-минимум-32-символа
   PORT=3000
   NODE_ENV=development
   ```

5. Запусти сервер:

   ```bash
   npm start
   ```

   Открой `http://localhost:3000`. Для разработки с автоматическим перезапуском используй `npm run dev`; синтаксическую проверку запускай командой `npm run check`.

6. Для включения загрузки готового мода создай каталог `public/downloads`, если его ещё нет, и скопируй туда сборку с именем `jvxVisual.jar`. Активная сессия пользователя нужна для загрузки; заблокированный аккаунт перенаправляется в профиль с причиной блокировки. Успешная выдача файла записывается в таблицу `downloads`.

В production задай `NODE_ENV=production`, используй HTTPS и храни секреты вне системы контроля версий. Сервер доверяет одному reverse-proxy хопу (`app.set('trust proxy', 1)`): запускай его за доверенным reverse proxy, который перезаписывает forwarded-заголовки, и не выставляй порт Node.js напрямую в недоверенную сеть. Если перед Node.js несколько доверенных proxy, явно настрой доверенную цепочку в `server/index.js` и синхронно настрой rate limiter; не включай доверие произвольному числу forwarded-хопов. Cookie сессии и cookie устройства помечаются `Secure` в production. Разрешающие CORS-заголовки сервер не отправляет; изменяющие запросы дополнительно проверяют `Origin`.

## Первый администратор

1. Зарегистрируй обычный аккаунт через сайт.
2. Подключись к базе под её администратором и присвой роль по email, использованному при регистрации:

   ```sql
   UPDATE users
   SET role = 'admin'
   WHERE LOWER(email) = LOWER('admin@example.com');
   ```

3. Убедись, что команда изменила ровно одну запись. Выйди из аккаунта и войди снова, затем открой `/admin`. Для выдачи обычных прав модератора замени `'admin'` на `'moderator'`.

## API мода

Проверка не требует авторизации и ограничена 60 запросами в минуту на IP. Ответ кэшируется в процессе сервера на 30 секунд:

```http
GET /api/mod/verify/ABC12345
```

Активный UID:

```json
{"valid":true,"uid":"ABC12345","status":"active"}
```

Заблокированный UID:

```json
{"valid":true,"uid":"ABC12345","status":"banned","reason":"Причина блокировки"}
```

Неизвестный или некорректный UID:

```json
{"valid":false}
```

Пример клиентской проверки для Fabric-мода. Minecraft включает Gson; проверку запускай примерно раз в 30 секунд. При заблокированном или неизвестном UID очисти локальную настройку и отключи функции, которым нужен UID. Изменять клиентское состояние Minecraft нужно через его основной поток.

```java
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.MinecraftClient;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public final class JvxUidVerifier {
    private static final HttpClient HTTP = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(4))
        .build();
    private static final ScheduledExecutorService TIMER = Executors.newSingleThreadScheduledExecutor();

    private JvxUidVerifier() {}

    public static void start(String configuredUid) {
        TIMER.scheduleAtFixedRate(() -> verify(configuredUid), 0, 30, TimeUnit.SECONDS);
    }

    private static void verify(String uid) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create("https://YOUR_SITE_HOST/api/mod/verify/" + uid))
            .timeout(Duration.ofSeconds(8))
            .GET()
            .build();

        HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString())
            .thenAccept(response -> {
                if (response.statusCode() != 200) return;

                JsonObject result = JsonParser.parseString(response.body()).getAsJsonObject();
                boolean valid = result.has("valid") && result.get("valid").getAsBoolean();
                String status = result.has("status") ? result.get("status").getAsString() : "invalid";

                MinecraftClient.getInstance().execute(() -> {
                    if (!valid || "banned".equals(status)) {
                        JvxConfig.setUid("");
                        JvxConfig.save();
                        JvxFeatures.setUidEnabled(false);
                        JvxMessages.show("UID недоступен. Проверь аккаунт на jvxVisual.");
                    } else if ("active".equals(status)) {
                        JvxFeatures.setUidEnabled(true);
                    }
                });
            })
            .exceptionally(error -> null);
    }
}
```

Замени `YOUR_SITE_HOST` и имена `JvxConfig`, `JvxFeatures`, `JvxMessages` на адрес и классы своего мода. Сетевые ошибки не должны трактоваться как подтверждение бана: оставь текущее состояние до следующей проверки либо отключай сетевые функции отдельно, согласно модели безопасности мода. Сервер не передаёт email, IP или другие личные данные этому API.

## Что хранится

- `users` — аккаунты, роли, UID и HMAC-хеш последнего IP.
- `ip_uid_links` — отдельные HMAC-связи IP и устройства с UID; исходные IP и device-токены не записываются. Модератор может удалить выбранную ошибочную IP- или device-привязку в админ-панели.
- `bans` — история блокировок UID с причиной, модератором и сроком.
- `mod_logs` — аудит действий модераторов и администраторов.
- `downloads` — отметки успешных выдач JAR.

SQL приложения параметризован. CORS не разрешает сторонним сайтам выполнять браузерные запросы к API. Сессии хранятся в JWT-cookie `HttpOnly`, `SameSite=Lax`; UID бана блокируется и в сайте, и в ответе API мода.