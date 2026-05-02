import crypto from "crypto";
import db from "./database.js";

const LEGACY_ALLOWED_EMAIL = "leolorenzo201123@gmail.com";
const TOKEN_ISSUER = "cedear-advisor-api";
const DEFAULT_TOKEN_TTL_DAYS = 7;
const TOKEN_TTL_DAYS = Math.max(
  1,
  parseInt(process.env.AUTH_TOKEN_TTL_DAYS || String(DEFAULT_TOKEN_TTL_DAYS), 10) || DEFAULT_TOKEN_TTL_DAYS
);
const TOKEN_TTL_SEC = TOKEN_TTL_DAYS * 24 * 60 * 60;
const MAX_CLOCK_SKEW_SEC = 30;
const MIN_REGISTER_PASSWORD_LENGTH = Math.max(
  10,
  parseInt(process.env.AUTH_MIN_PASSWORD_LENGTH || "12", 10) || 12
);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTP_STEP_SEC = 30;
const TOTP_DIGITS = 6;

// ============================================================
// TOTP Helpers (RFC 6238 compatible)
// ============================================================

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const map = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) map.set(alphabet[i], i);
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase()) {
    const idx = map.get(char);
    if (idx == null) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function computeTotp(secret: string, timestampSec = Math.floor(Date.now() / 1000)): string {
  const counter = Math.floor(timestampSec / TOTP_STEP_SEC);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter), 0);
  const key = base32Decode(secret);
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset + 1] & 0xff) << 16 | (hmac[offset + 2] & 0xff) << 8 | (hmac[offset + 3] & 0xff)) % (10 ** TOTP_DIGITS);
  return String(code).padStart(TOTP_DIGITS, "0");
}

function verifyTotp(secret: string, code: string, windowSteps = 1): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (let i = -windowSteps; i <= windowSteps; i++) {
    if (computeTotp(secret, now + i * TOTP_STEP_SEC) === code) return true;
  }
  return false;
}

export function getTotpSetupUri(secret: string, email: string): string {
  const label = encodeURIComponent(`CEDEAR-Advisor:${email}`);
  const issuer = encodeURIComponent("CEDEAR Advisor");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
}

export { generateTotpSecret, verifyTotp };

function envBool(key: string, fallback = false): boolean {
  const raw = process.env[key];
  if (raw == null || raw === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}

function normalizeEmailInput(email: unknown): string {
  const normalized = String(email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new Error("Credenciales inválidas.");
  }
  return normalized;
}

function normalizePasswordInput(password: unknown): string {
  if (typeof password !== "string") {
    throw new Error("Credenciales inválidas.");
  }
  return password;
}

function getAllowedEmails(): string[] {
  return [...new Set(
    String(
      process.env.AUTH_ALLOWED_EMAILS ||
      process.env.AUTH_ALLOWED_EMAIL ||
      LEGACY_ALLOWED_EMAIL
    )
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function isAllowedEmail(email: string): boolean {
  return getAllowedEmails().includes(email);
}

function validateRegisterPassword(password: string): void {
  if (password.length < MIN_REGISTER_PASSWORD_LENGTH) {
    throw new Error(`La contraseña debe tener al menos ${MIN_REGISTER_PASSWORD_LENGTH} caracteres.`);
  }

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (!hasLower || !hasUpper || !hasNumber || !hasSymbol) {
    throw new Error("La contraseña debe incluir mayúscula, minúscula, número y símbolo.");
  }
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "[auth] FATAL: JWT_SECRET no configurado. " +
      "Definí la variable de entorno JWT_SECRET antes de iniciar el servidor."
    );
  }
  return secret;
}

function b64urlEncodeJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function b64urlDecodeJson(input: string): unknown | null {
  try {
    const decoded = Buffer.from(String(input || ""), "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function safeEqualString(a: unknown, b: unknown): boolean {
  const aStr = String(a || "");
  const bStr = String(b || "");
  const aBuf = Buffer.from(aStr);
  const bBuf = Buffer.from(bStr);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function signJwtLike(headerB64: string, payloadB64: string): string {
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

interface JwtPayload {
  sub?: string;
  userId?: number;
  email?: string;
  iat?: number;
  exp?: number;
  iss?: string;
}

interface VerifiedToken {
  userId: number;
  email: string;
  exp: number;
}

function verifyJwtLike(token: string): VerifiedToken | null {
  const [headerB64, payloadB64, signature] = String(token || "").split(".");
  if (!headerB64 || !payloadB64 || !signature) return null;

  const expected = crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  if (!safeEqualString(signature, expected)) return null;

  const header = b64urlDecodeJson(headerB64) as { alg?: string; typ?: string } | null;
  if (header?.alg !== "HS256" || header?.typ !== "JWT") return null;

  const payload = b64urlDecodeJson(payloadB64) as JwtPayload | null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload?.exp !== "number" || payload.exp < nowSec - MAX_CLOCK_SKEW_SEC) {
    return null;
  }
  if (typeof payload?.iat !== "number" || payload.iat > nowSec + MAX_CLOCK_SKEW_SEC) {
    return null;
  }
  if (payload.iss !== TOKEN_ISSUER) return null;
  if (!payload.email || typeof payload.email !== "string") return null;

  const userId = Number(payload.userId ?? payload.sub);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  return {
    userId,
    email: payload.email,
    exp: payload.exp * 1000,
  };
}

function verifyLegacyToken(token: string): VerifiedToken | null {
  try {
    const [payloadB64, signatureHex] = String(token || "").split(".");
    if (!payloadB64 || !signatureHex) return null;

    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expectedSigHex = crypto
      .createHmac("sha256", getJwtSecret())
      .update(payload)
      .digest("hex");
    if (!safeEqualString(signatureHex, expectedSigHex)) return null;

    const data = JSON.parse(payload) as JwtPayload | null;
    if (!data || typeof data !== "object") return null;
    if (!data.email || typeof data.email !== "string") return null;
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    const userId = Number(data.userId);
    if (!Number.isFinite(userId) || userId <= 0) return null;
    return { userId, email: data.email, exp: data.exp };
  } catch {
    return null;
  }
}

function generateSalt(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, "sha512", (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

export function generateToken(userId: number | string, email: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: String(userId),
    userId: Number(userId),
    email,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SEC,
    iss: TOKEN_ISSUER,
  };

  const headerB64 = b64urlEncodeJson(header);
  const payloadB64 = b64urlEncodeJson(payload);
  return signJwtLike(headerB64, payloadB64);
}

function verifyToken(token: string): VerifiedToken | null {
  try {
    const parts = String(token || "").split(".");
    if (parts.length === 3) return verifyJwtLike(token);
    if (parts.length === 2) return verifyLegacyToken(token);
    return null;
  } catch {
    return null;
  }
}

export async function canRegister(): Promise<boolean> {
  if (process.env.AUTH_PASSWORD) return false;
  const count = (await db.execute("SELECT COUNT(*) as count FROM users")).rows[0] as unknown as { count: number } | undefined;
  return (count?.count || 0) === 0;
}

export async function register(email: string, password: string): Promise<string> {
  const normalizedEmail = normalizeEmailInput(email);
  const normalizedPassword = normalizePasswordInput(password);

  if (!(await canRegister())) throw new Error("Registro cerrado. Ya existe un usuario.");
  if (!isAllowedEmail(normalizedEmail)) throw new Error("Email no autorizado.");
  validateRegisterPassword(normalizedPassword);

  const salt = generateSalt();
  const hash = await hashPassword(normalizedPassword, salt);
  const result = await db.execute({
    sql: "INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)",
    args: [normalizedEmail, hash, salt],
  });
  return generateToken(Number(result.lastInsertRowid), normalizedEmail);
}

export async function login(email: string, password: string, totpCode?: string): Promise<string> {
  const normalizedEmail = normalizeEmailInput(email);
  const normalizedPassword = normalizePasswordInput(password);

  if (!isAllowedEmail(normalizedEmail)) throw new Error("Credenciales inválidas.");

  if (process.env.AUTH_PASSWORD) {
    const expectedHash = crypto.createHash("sha256").update(process.env.AUTH_PASSWORD).digest();
    const actualHash = crypto.createHash("sha256").update(normalizedPassword).digest();
    if (!crypto.timingSafeEqual(expectedHash, actualHash)) throw new Error("Contraseña incorrecta.");

    const user = (
      await db.execute({
        sql: "SELECT * FROM users WHERE email = ?",
        args: [normalizedEmail],
      })
    ).rows[0] as unknown as { id: number; email: string; totp_secret?: string } | undefined;

    if (!user) {
      const count = (await db.execute("SELECT COUNT(*) as count FROM users")).rows[0] as unknown as { count: number } | undefined;
      if ((count?.count || 0) > 0) {
        throw new Error("Usuario no encontrado.");
      }
      const salt = generateSalt();
      const hash = await hashPassword(normalizedPassword, salt);
      const result = await db.execute({
        sql: "INSERT INTO users (email, password_hash, salt) VALUES (?, ?, ?)",
        args: [normalizedEmail, hash, salt],
      });
      return generateToken(Number(result.lastInsertRowid), normalizedEmail);
    }

    // Verificar TOTP si está configurado
    if (user.totp_secret) {
      if (!totpCode || !verifyTotp(user.totp_secret, totpCode)) {
        throw new Error("Código 2FA inválido o requerido.");
      }
    }

    return generateToken(user.id, user.email);
  }

  const user = (
    await db.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [normalizedEmail] })
  ).rows[0] as unknown as { id: number; email: string; password_hash: string; salt?: string; totp_secret?: string } | undefined;
  if (!user) {
    if (await canRegister()) {
      throw new Error("No hay usuario creado todavía. Registrate primero.");
    }
    throw new Error("Usuario no encontrado.");
  }

  const salt = user.salt || getJwtSecret();
  const hash = await hashPassword(normalizedPassword, salt);

  if (user.password_hash.length !== hash.length) throw new Error("Contraseña incorrecta.");
  if (!crypto.timingSafeEqual(Buffer.from(user.password_hash), Buffer.from(hash))) {
    throw new Error("Contraseña incorrecta.");
  }

  if (!user.salt) {
    const newSalt = generateSalt();
    const newHash = await hashPassword(normalizedPassword, newSalt);
    await db.execute({
      sql: "UPDATE users SET password_hash = ?, salt = ? WHERE id = ?",
      args: [newHash, newSalt, user.id],
    });
  }

  // Verificar TOTP si está configurado
  if (user.totp_secret) {
    if (!totpCode || !verifyTotp(user.totp_secret, totpCode)) {
      throw new Error("Código 2FA inválido o requerido.");
    }
  }

  return generateToken(user.id, user.email);
}

export async function getUserTotpStatus(userId: number): Promise<{ enabled: boolean; uri?: string }> {
  const user = (
    await db.execute({ sql: "SELECT totp_secret FROM users WHERE id = ?", args: [userId] })
  ).rows[0] as unknown as { totp_secret?: string } | undefined;
  if (!user) throw new Error("Usuario no encontrado.");
  return { enabled: !!user.totp_secret };
}

export async function enableTotp(userId: number, email: string): Promise<{ secret: string; uri: string }> {
  const secret = generateTotpSecret();
  await db.execute({
    sql: "UPDATE users SET totp_secret = ? WHERE id = ?",
    args: [secret, userId],
  });
  return { secret, uri: getTotpSetupUri(secret, email) };
}

export async function disableTotp(userId: number, totpCode: string): Promise<void> {
  const user = (
    await db.execute({ sql: "SELECT totp_secret FROM users WHERE id = ?", args: [userId] })
  ).rows[0] as unknown as { totp_secret?: string } | undefined;
  if (!user?.totp_secret) throw new Error("2FA no está habilitado.");
  if (!verifyTotp(user.totp_secret, totpCode)) throw new Error("Código 2FA inválido.");
  await db.execute({
    sql: "UPDATE users SET totp_secret = NULL WHERE id = ?",
    args: [userId],
  });
}

export async function requireTotpForRealCapital(): Promise<boolean> {
  return envBool("REQUIRE_2FA_FOR_REAL_CAPITAL", true);
}

export function authMiddleware(req: any, res: any, next: any): void {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  const token = authHeader.split(" ")[1];
  const data = verifyToken(token);
  if (!data) return res.status(401).json({ error: "Token inválido o expirado" });
  req.user = data;
  next();
}
