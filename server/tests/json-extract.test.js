import test from "node:test";
import assert from "node:assert/strict";

import { extractJSON } from "../aiAdvisor.js";

test("extractJSON parsea bloque markdown con coma final", () => {
  const raw = "texto```json\n{\"ok\":true,\"n\":1,}\n```";
  const parsed = JSON.parse(extractJSON(raw));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.n, 1);
});

test("extractJSON toma el objeto JSON más grande válido", () => {
  const raw = "a {\"mini\":1} b {\"big\":{\"x\":1,\"y\":2}} c";
  const parsed = JSON.parse(extractJSON(raw));
  assert.deepEqual(parsed, { big: { x: 1, y: 2 } });
});

test("extractJSON limpia tags <cite>", () => {
  const raw = "{\"ok\":true}<cite>fuente</cite>";
  const parsed = JSON.parse(extractJSON(raw));
  assert.equal(parsed.ok, true);
});
