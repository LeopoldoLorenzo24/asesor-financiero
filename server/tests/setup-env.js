import { join } from "path";
import { tmpdir } from "os";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123";
process.env.AUTH_ALLOWED_EMAILS = process.env.AUTH_ALLOWED_EMAILS || "test@example.com";
process.env.TURSO_URL = process.env.TURSO_URL || `file:${join(tmpdir(), `cedear-advisor-test-${process.pid}.db`)}`;
