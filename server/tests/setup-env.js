import { join } from "path";
import { tmpdir } from "os";

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123";
process.env.AUTH_ALLOWED_EMAILS = process.env.AUTH_ALLOWED_EMAILS || "test@example.com";
process.env.TURSO_URL = process.env.TURSO_URL || `file:${join(tmpdir(), `cedear-advisor-test-${process.pid}.db`)}`;
// Ensure canRegister() returns true in tests (AUTH_PASSWORD forces it false).
// Set to empty string so dotenv.config() won't override it from .env.
process.env.AUTH_PASSWORD = "";
