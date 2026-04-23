# Guia de Tokens y API Keys - CEDEAR Advisor

Este documento te dice **exactamente donde conseguir cada token** y **donde pegarlo** en el proyecto.

---

## 1. ANTHROPIC API KEY (OBLIGATORIO)

**Para que sirve:** El motor de IA que analiza CEDEARs y genera recomendaciones.

**Donde conseguirlo:**
1. Andá a https://console.anthropic.com/settings/keys
2. Logueate con tu cuenta
3. Click en "Create Key"
4. Copiá la clave (empieza con `sk-ant-api03-`)

**Donde pegarlo:**
```
Archivo: server/.env
Linea: ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxx...
```

**Precaucion:** Esta key consume creditos. Cada analisis de IA cusa aproximadamente ~$0.01-0.03 USD.

---

## 2. TURSO (Base de Datos)

**Para que sirve:** Guarda todo: portfolio, transacciones, predicciones, capital, sesiones de analisis, portfolio virtual, datos de ML.

**Donde conseguirlo:**
1. Andá a https://turso.tech
2. Creá una cuenta gratis
3. En el dashboard, creá una base de datos
4. Click en "Generate Token" o usá el CLI:
   ```bash
   turso db tokens create tu-db-name
   ```

**Donde pegarlo:**
```
Archivo: server/.env
Linea: TURSO_URL=libsql://tu-db-xxx.turso.io
Linea: TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQ...
```

---

## 3. JWT SECRET (OBLIGATORIO)

**Para que sirve:** Firma los tokens de autenticacion. SI lo cambias, todos los usuarios logueados se desloguean.

**Donde conseguirlo:** Generalo vos mismo. Tiene que ser aleatorio y de minimo 32 caracteres.

**Como generarlo:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Donde pegarlo:**
```
Archivo: server/.env
Linea: JWT_SECRET=tu-string-aleatorio-de-64-caracteres-hex
```

---

## 4. AUTH PASSWORD (OBLIGATORIO)

**Para que sirve:** Es la contrasena que usas para entrar al sistema desde el frontend.

**Donde pegarlo:**
```
Archivo: server/.env
Linea: AUTH_PASSWORD=tu-password-secreta
```

---

## 5. TELEGRAM BOT TOKEN (OPCIONAL)

**Para que sirve:** Manda alertas automaticas de stop-loss, take-profit y resumen diario a tu Telegram.

**Donde conseguirlo:**
1. Abrí Telegram y buscá `@BotFather`
2. Mandá `/newbot`
3. Seguí los pasos (nombre y username del bot)
4. Te va a dar un token como `123456789:AAFxxxxxxxxxxxxxxxxxx`

**Donde pegarlo:**
```
Archivo: server/.env
Linea: TELEGRAM_BOT_TOKEN=123456789:AAFxxxxxxxxxx
```

**Para conseguir tu Chat ID:**
1. Buscá `@userinfobot` en Telegram
2. Mandá `/start`
3. Te va a decer tu ID numerico (ej: `12345678`)

**Donde pegarlo:**
```
Archivo: server/.env
Linea: TELEGRAM_CHAT_ID=12345678
```

---

## 6. FINNHUB API KEY (OPCIONAL)

**Para que sirve:** Fuente de respaldo para datos fundamentalistas (P/E, margenes, recomendaciones de analistas) cuando Yahoo Finance no devuelve nada.

**Donde conseguirlo:**
1. Andá a https://finnhub.io/dashboard
2. Registrate (gratis, 60 calls/minuto)
3. En el dashboard, copiá tu API Key

**Donde pegarlo:**
```
Archivo: server/.env
Linea: FINNHUB_API_KEY=cqxxxxxxxxxxxxxxxx
```

---

## Resumen Rapido

| Variable | Obligatorio | URL para conseguirla |
|----------|-------------|---------------------|
| `ANTHROPIC_API_KEY` | SI | https://console.anthropic.com/settings/keys |
| `TURSO_URL` | SI | https://turso.tech |
| `TURSO_AUTH_TOKEN` | SI | https://turso.tech (o CLI) |
| `JWT_SECRET` | SI | Generalo con `crypto.randomBytes` |
| `AUTH_PASSWORD` | SI | Elegila vos |
| `TELEGRAM_BOT_TOKEN` | NO | @BotFather en Telegram |
| `TELEGRAM_CHAT_ID` | NO | @userinfobot en Telegram |
| `FINNHUB_API_KEY` | NO | https://finnhub.io/dashboard |

---

## Archivo unico donde van TODOS

Todo va en un solo archivo:
```
server/.env
```

No hace falta tocar ningun otro archivo del proyecto para configurar tokens.
