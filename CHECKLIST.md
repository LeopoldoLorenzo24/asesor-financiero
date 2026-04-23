# ✅ CHECKLIST DE ACCIONES PENDIENTES — CEDEAR Advisor

> Estas son las tareas que **requieren acción humana externa** y no pueden ser automatizadas por el agente.

---

## 🔴 URGENTE — Seguridad (hacer HOY)

### 1. Rotar secretos expuestos
El archivo `server/.env` contiene credenciales reales en texto plano en tu filesystem.

- [ ] **Anthropic API Key**
  - Ir a https://console.anthropic.com/
  - Revocar la key actual (`sk-ant-api03-gAJd7oh...`)
  - Generar una nueva
  - Reemplazar en `server/.env`

- [ ] **Turso Auth Token**
  - Ir al dashboard de Turso (https://turso.tech/)
  - Rotar el token (`eyJhbGciOiJFZERTQ...`)
  - Reemplazar en `server/.env`

- [ ] **Contraseña de Auth**
  - Cambiar `AUTH_PASSWORD=7532159Leo$` por una nueva segura
  - Considerar eliminar esta variable y usar solo hash de DB

- [ ] **Verificar historial de git**
  ```bash
  git log --all --full-history -- server/.env
  git log --all -p -- server/.env
  ```
  Si aparece en el historial, las credenciales están comprometidas permanentemente.
  - Solución: usar `git-filter-repo` o `BFG Repo-Cleaner` para eliminar el archivo del historial.

### 2. Proteger el archivo .env
- [ ] Agregar `server/.env` a `.gitignore` (ya está, verificar)
- [ ] `chmod 600 server/.env` (solo lectura/escritura para el owner)
- [ ] Nunca subir `.env` a GitHub, Render, ni compartirlo por Slack/WhatsApp

---

## 🟠 ALTO — Infraestructura y Despliegue

### 3. Variables de entorno en el host de producción
- [ ] En Render (o donde deployes), configurar estas variables como **Environment Variables**:
  - `JWT_SECRET` → generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - `ANTHROPIC_API_KEY` → la nueva key rotada
  - `TURSO_URL` y `TURSO_AUTH_TOKEN` → los nuevos valores
  - `CLIENT_ORIGIN` → URL de tu frontend en producción (ej: `https://cedear-advisor.onrender.com`)
  - `AUTH_PASSWORD` → nueva contraseña (o dejar vacío para usar DB hash)

### 4. Instalar `helmet` en producción
- [ ] `cd server && npm install helmet`
- [ ] Agregar `import helmet from "helmet"` en `server/index.js`
- [ ] `app.use(helmet())` antes de los routers
- Esto agrega: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.

### 5. Configurar Content-Security-Policy (CSP) para el frontend
- [ ] En el servidor Express, agregar header CSP que permita scripts de `self` y Recharts:
  ```js
  app.use(helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline necesario para Vite/React en prod
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  }));
  ```

---

## 🟡 MEDIO — Calidad y Mantenibilidad

### 6. Migrar a TypeScript
- [ ] Evaluar si vale la pena ahora o post-MVP
- [ ] Si decidís migrar, empezar por `config.js`, `utils.js`, y `riskManager.js` (los más críticos)
- **Justificación**: Sin tipos, cualquier cambio en la estructura de la DB o API puede romper cosas silenciosamente

### 7. Tests de integración (end-to-end)
- [ ] Actualmente tenés 65 tests unitarios. Faltan tests de API:
  - POST `/api/portfolio/buy` → verificar que persiste en DB
  - GET `/api/ranking` → verificar estructura de respuesta
  - POST `/api/ai/analyze` → verificar rate limiting y cooldown
- [ ] Herramientas: `supertest` + `node:test`

### 8. Frontend: extraer vistas de App.jsx
- [ ] `App.jsx` sigue teniendo 700+ líneas. Las funciones `renderDashboard`, `renderRanking`, `renderDetail`, etc. deberían ser componentes independientes en `client/src/views/`
- Esto reduciría re-renders y mejoraría la mantenibilidad drásticamente

### 9. Logs estructurados (no console.log)
- [ ] Reemplazar todos los `console.log`/`console.error` del servidor por un logger estructurado como `pino`
- [ ] Configurar rotación de logs (no escribir a archivos infinitos)
- [ ] Agregar `requestId` a cada log para trazabilidad

### 10. Monitoreo y alertas
- [ ] Agregar health check externo (ej. UptimeRobot, Pingdom) que pegue a `/api/health`
- [ ] Configurar alerta si el servidor no responde en 60 segundos
- [ ] Agregar métricas de negocio: tiempo de respuesta de `/ranking`, tasa de error de la IA, etc.

---

## 🟢 BAJO — Mejoras futuras

### 11. Base de datos
- [ ] Actualmente es SQLite/Turso (serverless SQL). Para escalar a múltiples usuarios, evaluar PostgreSQL
- [ ] Agregar backups automáticos de Turso (`turso db shell cedear-advisor .dump > backup.sql`)

### 12. Autenticación
- [ ] El JWT es casero (HMAC-SHA256 con crypto nativo). Funciona, pero:
  - No tiene refresh tokens
  - No tiene blacklist/logout de tokens
  - No tiene rate limiting por email (solo por IP)
- [ ] Evaluar migrar a `jsonwebtoken` npm package + refresh tokens

### 13. Caché distribuida
- [ ] El caché actual es en memoria (`NodeCache`) + archivos JSON en disco
- [ ] Si escalás a múltiples instancias del servidor, el caché en memoria no se comparte
- [ ] Evaluar Redis para caché distribuida

### 14. CI/CD
- [ ] Agregar GitHub Actions:
  - `npm test` en cada PR
  - `npm run build` del frontend en cada PR
  - Deploy automático a Render cuando se mergea a `main`

### 15. Documentación para usuarios
- [ ] README.md con instrucciones de instalación, variables de entorno requeridas, y cómo correr tests
- [ ] Documentar el formato esperado del `portfolio.json` para importación masiva

---

## 🎯 Mi opinión honesta sobre el estado del sistema

**¿Está hecho una joya? No todavía. Pero está en el camino correcto.**

### Lo que SÍ está joya:
- ✅ Tests unitarios sólidos (65/65 pasando)
- ✅ Configuración centralizada y sin valores hardcodeados dispersos
- ✅ Multi-proveedor de datos con fallback (Yahoo → Finnhub → Stooq)
- ✅ Cache persistente en disco
- ✅ Rate limiting persistente en DB
- ✅ Gestión de riesgo integrada (drawdown, concentración sectorial, posición)
- ✅ Anti-alucinación en prompts de IA con validaciones post-hoc
- ✅ Modularización de rutas (de monolito 915 líneas a 8 routers)
- ✅ Graceful shutdown y manejo de señales del sistema

### Lo que todavía NO está joya:
- ❌ **TypeScript**: JS puro sin tipos. Un typo en un campo de la DB puede romper todo silenciosamente.
- ❌ **Frontend monolítico**: `App.jsx` con 700 líneas, todas las vistas inline. Es un mantenimiento a largo plazo difícil.
- ❌ **Auth casera**: JWT hecho a mano sin refresh tokens ni blacklist. Funciona para 1 usuario, no escala.
- ❌ **Sin tests de integración**: Los tests no tocan la API HTTP real ni la DB.
- ❌ **Logs desestructurados**: `console.log` por todos lados, imposible filtrar en producción.
- ❌ **Sin monitoreo**: Si el servidor se cae a las 3 AM, no te enterás hasta que lo intentás usar.
- ❌ **Helmet no instalado**: Faltan headers de seguridad HTTP (CSP, HSTS, etc.).

### Veredicto final:
> **Es un sistema sólido, funcional y bien arquitectado para un MVP / uso personal.** Pero para llamarlo "joya" necesita: TypeScript, tests de integración, frontend modularizado, y monitoreo. Con esas 4 cosas, sí es joya.

---

## 📋 Orden recomendado de prioridades

1. **HOY**: Rotar secretos + verificar git history
2. **Esta semana**: Instalar helmet + configurar variables de entorno en Render
3. **Próximas 2 semanas**: Tests de integración con supertest
4. **Próximo mes**: Extraer vistas de App.jsx a componentes independientes
5. **Post-MVP**: Migración a TypeScript (empezando por config/utils)
