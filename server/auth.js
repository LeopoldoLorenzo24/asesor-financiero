import crypto from "crypto";
import db from "./database.js";

const ALLOWED_EMAIL = "leolorenzo201123@gmail.com";
const JWT_SECRET = process.env.JWT_SECRET || "cedear-advisor-secret-key-change-this";

function generateSalt() {
  return crypto.randomBytes(32).toString("hex");
}

// salt parameter: per-user random salt (new) or JWT_SECRET as fallback (legacy)
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function generateToken(userId, email) {
  const payload = JSON.stringify({ userId, email, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64url") + "." + signature;
}

function verifyToken(token) {
  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;
    const payload = Buffer.from(payloadB64, "base64url").toString();
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

export async function canRegister() {
  if (process.env.AUTH_PASSWORD) return false; // env password mode: always login, never register
  const count = (await db.execute("SELECT COUNT(*) as count FROM users")).rows[0];
  return count.count === 0;
}

export async function register(email, password) {
  if (!(await canRegister())) throw new Error("Registro cerrado. Ya existe un usuario.");
  if (email.toLowerCase() !== ALLOWED_EMAIL) throw new Error("Email no autorizado.");
  if (!password || password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  const result = await db.execute({
    sql: "INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)",
    args: [email.toLowerCase(), hash, salt],
  });
  return generateToken(Number(result.lastInsertRowid), email.toLowerCase());
}

export async function login(email, password) {
  if (email.toLowerCase() !== ALLOWED_EMAIL) throw new Error("Email no autorizado.");

  // Validate password against env var if set (timing-safe via hash comparison)
  if (process.env.AUTH_PASSWORD) {
    const expectedHash = crypto.createHash("sha256").update(process.env.AUTH_PASSWORD).digest();
    const actualHash = crypto.createHash("sha256").update(password).digest();
    if (!crypto.timingSafeEqual(expectedHash, actualHash)) throw new Error("Contraseña incorrecta.");

    // Ensure user exists in DB (auto-create on first login)
    let user = (await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email.toLowerCase()] })).rows[0];
    if (!user) {
      const salt = generateSalt();
      const hash = hashPassword(password, salt);
      const result = await db.execute({
        sql: "INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)",
        args: [email.toLowerCase(), hash, salt],
      });
      return generateToken(Number(result.lastInsertRowid), email.toLowerCase());
    }
    return generateToken(user.id, user.email);
  }

  // Fallback: validate against DB hash
  const user = (await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [email.toLowerCase()] })).rows[0];
  if (!user) throw new Error("Usuario no encontrado.");

  // Support legacy users (no per-user salt) and new users (with salt)
  const salt = user.salt || JWT_SECRET;
  const hash = hashPassword(password, salt);

  if (user.password_hash.length !== hash.length) throw new Error("Contraseña incorrecta.");
  if (!crypto.timingSafeEqual(Buffer.from(user.password_hash), Buffer.from(hash))) {
    throw new Error("Contraseña incorrecta.");
  }

  // Upgrade legacy user to per-user salt on successful login
  if (!user.salt) {
    const newSalt = generateSalt();
    const newHash = hashPassword(password, newSalt);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
      args: [newHash, newSalt, user.id],
    });
  }

  return generateToken(user.id, user.email);
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  const token = authHeader.split(" ")[1];
  const data = verifyToken(token);
  if (!data) return res.status(401).json({ error: "Token inválido o expirado" });
  req.user = data;
  next();
}
