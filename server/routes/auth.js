import { Router } from "express";
import { canRegister, register, login, getUserTotpStatus, enableTotp, disableTotp, requireTotpForRealCapital, authMiddleware } from "../auth.js";

export default function createAuthRouter(authRateLimit) {
  const router = Router();

  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/status", async (req, res) => {
    res.json({ canRegister: await canRegister(), require2faForRealCapital: await requireTotpForRealCapital() });
  });

  router.post("/register", authRateLimit, async (req, res) => {
    try {
      const { email, password } = req.body;
      if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Email y contraseña son obligatorios." });
      }
      const token = await register(email, password);
      res.json({ token, email: email.trim().toLowerCase() });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/login", authRateLimit, async (req, res) => {
    try {
      const { email, password, totpCode } = req.body;
      if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Email y contraseña son obligatorios." });
      }
      const token = await login(email, password, totpCode);
      res.json({ token, email: email.trim().toLowerCase() });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  router.get("/2fa/status", authMiddleware, async (req, res) => {
    try {
      const status = await getUserTotpStatus(req.user.userId);
      res.json(status);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/2fa/enable", authMiddleware, async (req, res) => {
    try {
      const setup = await enableTotp(req.user.userId, req.user.email);
      res.json({ secret: setup.secret, uri: setup.uri });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post("/2fa/disable", authMiddleware, async (req, res) => {
    try {
      const { totpCode } = req.body;
      if (typeof totpCode !== "string") {
        return res.status(400).json({ error: "Código 2FA requerido." });
      }
      await disableTotp(req.user.userId, totpCode);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
