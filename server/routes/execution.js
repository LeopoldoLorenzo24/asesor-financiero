import { Router } from "express";
import {
  getExecutionAssistantSettings,
  getExecutionTradeTickets,
  saveExecutionAssistantSettings,
  updateExecutionTradeTicketStatus,
} from "../database.js";
import { buildExecutionAssistantPayload } from "../executionAssistant.js";
import { sendInternalError } from "../http.js";

const router = Router();

function mapStatusQuery(value) {
  if (value === "pending") return ["pending_confirmation"];
  if (value === "confirmed") return ["confirmed"];
  if (value === "all") return ["pending_confirmation", "confirmed", "rejected", "executed_manual"];
  return ["pending_confirmation", "confirmed"];
}

router.get("/system/execution-assistant", async (req, res) => {
  try {
    const userId = req.user?.userId;
    const settings = await getExecutionAssistantSettings(userId);
    const tickets = userId != null
      ? await getExecutionTradeTickets(userId, ["pending_confirmation", "confirmed"], 20)
      : [];
    res.json(buildExecutionAssistantPayload(settings, tickets));
  } catch (err) {
    sendInternalError(res, "execution.settings", err);
  }
});

router.post("/system/execution-assistant", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Sesión inválida" });
    const saved = await saveExecutionAssistantSettings(
      userId,
      req.body?.suggestionMode,
      req.body?.maxCriticalAlertsPerDay
    );
    const tickets = await getExecutionTradeTickets(userId, ["pending_confirmation", "confirmed"], 20);
    res.json({
      success: true,
      ...buildExecutionAssistantPayload(saved, tickets),
    });
  } catch (err) {
    sendInternalError(res, "execution.saveSettings", err);
  }
});

router.get("/execution-tickets", async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Sesión inválida" });
    const statuses = mapStatusQuery(String(req.query.status || "open"));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    res.json({
      tickets: await getExecutionTradeTickets(userId, statuses, limit),
      statusFilter: String(req.query.status || "open"),
    });
  } catch (err) {
    sendInternalError(res, "execution.tickets", err);
  }
});

router.post("/execution-tickets/:id/confirm", async (req, res) => {
  try {
    const userId = req.user?.userId;
    const ticketId = Number(req.params.id);
    if (!userId || !Number.isFinite(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Ticket inválido" });
    }
    const ticket = await updateExecutionTradeTicketStatus(userId, ticketId, "confirmed");
    res.json({ success: true, ticket });
  } catch (err) {
    sendInternalError(res, "execution.confirm", err);
  }
});

router.post("/execution-tickets/:id/reject", async (req, res) => {
  try {
    const userId = req.user?.userId;
    const ticketId = Number(req.params.id);
    if (!userId || !Number.isFinite(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Ticket inválido" });
    }
    const ticket = await updateExecutionTradeTicketStatus(userId, ticketId, "rejected");
    res.json({ success: true, ticket });
  } catch (err) {
    sendInternalError(res, "execution.reject", err);
  }
});

router.post("/execution-tickets/:id/executed", async (req, res) => {
  try {
    const userId = req.user?.userId;
    const ticketId = Number(req.params.id);
    if (!userId || !Number.isFinite(ticketId) || ticketId <= 0) {
      return res.status(400).json({ error: "Ticket inválido" });
    }
    const ticket = await updateExecutionTradeTicketStatus(userId, ticketId, "executed_manual");
    res.json({ success: true, ticket });
  } catch (err) {
    sendInternalError(res, "execution.executed", err);
  }
});

export default router;
