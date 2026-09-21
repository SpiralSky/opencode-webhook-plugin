// Discord notifications for completed / failed sessions.
// Webhook URL comes from the DISCORD_WEBHOOK_URL environment variable
// (see .env.example). Kept out of the repo: it is a secret token.
const TIMEOUT_MS = 8000;
// Skip repeat notifications for the same session inside this window.
// opencode can emit session.idle more than once per turn (busy→idle,
// retry→idle, title/subagent sessions), and every emit used to = one POST.
const DEDUP_MS = 60000;
const lastSent = new Map();

// Sessions spawned as subagents (Session.parentID set). Their activity is not
// user-facing: a multi-task plan fire a task-runner subagent per step, and each
// one emits session.idle — without this, Discord gets spammed per subagent.
const subagentSessions = new Set();

function boundedAdd(set, value) {
  if (set.size > 500) {
    set.delete(set.values().next().value);
  }
  set.add(value);
}

function shouldSend(key) {
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev !== undefined && now - prev < DEDUP_MS) return false;
  lastSent.set(key, now);
  // Bound memory: module stays loaded for the whole server lifetime.
  if (lastSent.size > 500) {
    const oldest = [...lastSent.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) lastSent.delete(oldest[0]);
  }
  return true;
}

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

async function sendWebhook(content) {
  const url = WEBHOOK_URL;
  if (!url) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    });
  } catch {
    // Never throw: a throwing event hook can take down the opencode worker.
    // Network failures / timeouts / aborts are silently ignored.
  } finally {
    clearTimeout(timer);
  }
}

export const WebhookPlugin = async () => {
  return {
    // Must never throw. opencode calls this for EVERY bus event; an uncaught
    // TypeError here (e.g. `event.type` on undefined) crashes the session worker.
    event: async (input) => {
      try {
        const event = input?.event;
        if (!event || typeof event.type !== "string") return;

        if (event.type === "session.created") {
          const info = event.properties?.info;
          if (info?.parentID) boundedAdd(subagentSessions, info.id);
        } else if (event.type === "session.deleted") {
          subagentSessions.delete(event.properties?.info?.id);
        } else if (event.type === "session.idle") {
          const sessionID = event.properties?.sessionID;
          if (subagentSessions.has(sessionID)) return;
          const key = `idle:${typeof sessionID === "string" ? sessionID : "global"}`;
          if (!shouldSend(key)) return;
          const short = typeof sessionID === "string" ? ` (${sessionID.slice(-6)})` : "";
          await sendWebhook(`Response completed${short}`);
        } else if (event.type === "session.error") {
          const sessionID = event.properties?.sessionID;
          const key = `error:${typeof sessionID === "string" ? sessionID : "global"}`;
          if (!shouldSend(key)) return;
          const short = typeof sessionID === "string" ? ` (${sessionID.slice(-6)})` : "";
          await sendWebhook(`Session error${short}`);
        }
      } catch {
        // Swallow everything: notification failures must never crash opencode.
      }
    },
  };
};

export default WebhookPlugin;
