import test from "node:test";
import assert from "node:assert/strict";
import { isCorsOriginAllowed } from "../http.js";

test("isCorsOriginAllowed acepta origins explícitamente whitelisteados", () => {
  const allowed = isCorsOriginAllowed({
    origin: "https://app.example.com",
    allowedOrigins: new Set(["https://app.example.com"]),
    requestHost: "api.example.com",
    requestProto: "https",
  });

  assert.equal(allowed, true);
});

test("isCorsOriginAllowed acepta same-origin por host y protocolo", () => {
  const allowed = isCorsOriginAllowed({
    origin: "https://advisor.example.com",
    allowedOrigins: new Set(),
    requestHost: "advisor.example.com",
    requestProto: "https",
  });

  assert.equal(allowed, true);
});

test("isCorsOriginAllowed rechaza origins cruzados no whitelisteados", () => {
  const allowed = isCorsOriginAllowed({
    origin: "https://evil.example.com",
    allowedOrigins: new Set(["https://app.example.com"]),
    requestHost: "advisor.example.com",
    requestProto: "https",
  });

  assert.equal(allowed, false);
});

test("isCorsOriginAllowed rechaza mismo host con protocolo distinto", () => {
  const allowed = isCorsOriginAllowed({
    origin: "http://advisor.example.com",
    allowedOrigins: new Set(),
    requestHost: "advisor.example.com",
    requestProto: "https",
  });

  assert.equal(allowed, false);
});
