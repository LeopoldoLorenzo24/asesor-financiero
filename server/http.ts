import type { Request, Response } from "express";

const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "Authorization"];
const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "DELETE", "OPTIONS"];
const DEFAULT_MAX_AGE_SEC = 600;
const DEFAULT_INTERNAL_ERROR_MESSAGE = "Error interno del servidor.";

function normalizeHeaderToken(value: string | undefined): string {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

export function isCorsOriginAllowed({
  origin,
  allowedOrigins,
  requestHost,
  requestProto,
}: {
  origin?: string | null;
  allowedOrigins: Set<string>;
  requestHost?: string | null;
  requestProto?: string | null;
}): boolean {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  const normalizedHost = normalizeHeaderToken(requestHost || undefined);
  const normalizedProto = normalizeHeaderToken(requestProto || undefined);
  if (!normalizedHost) return false;

  try {
    const originUrl = new URL(origin);
    if (originUrl.host.toLowerCase() !== normalizedHost) return false;
    if (!normalizedProto) return true;
    return originUrl.protocol === `${normalizedProto}:`;
  } catch {
    return false;
  }
}

export function createCorsOptionsDelegate(allowedOrigins: Set<string>) {
  return (req: Request, callback: (err: Error | null, options?: Record<string, unknown>) => void) => {
    const origin = req.header("Origin");
    const allowed = isCorsOriginAllowed({
      origin,
      allowedOrigins,
      requestHost: req.header("x-forwarded-host") || req.header("host"),
      requestProto: req.header("x-forwarded-proto") || req.protocol,
    });

    if (!allowed) {
      callback(new Error("CORS no permitido"));
      return;
    }

    callback(null, {
      origin: true,
      allowedHeaders: DEFAULT_ALLOWED_HEADERS,
      methods: DEFAULT_ALLOWED_METHODS,
      maxAge: DEFAULT_MAX_AGE_SEC,
    });
  };
}

export function sendInternalError(
  res: Response,
  context: string,
  err: unknown,
  message = DEFAULT_INTERNAL_ERROR_MESSAGE
) {
  console.error(`[${context}]`, err);
  return res.status(500).json({ error: message });
}
