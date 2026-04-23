import { Router } from "express";
import { canRegister, register, login } from "../auth.js";

export default function createAuthRouter(authRateLimit) {
  const router = Router();

  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/status", async (req, res) => {
    res.json({ canRegister: await canRegister() });
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
      const { email, password } = req.body;
      if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Email y contraseña son obligatorios." });
      }
      const token = await login(email, password);
      res.json({ token, email: email.trim().toLowerCase() });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  });

  return router;
}
