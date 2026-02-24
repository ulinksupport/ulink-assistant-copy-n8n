// src/api.js
import {
  API_BASE,
  LOGIN_PATH,
  REGISTER_PATH,
  PROFILE_PATH,
} from './config';

// integration
import {
  getListOfAssistant
} from './integrations/assistant-integration';

import {
  postNewSession
} from './integrations/session-integration';

import {
  doUpdateChatTitle,
  postChatStreamingV2API,
  retrieveChatHistory,
  doDownloadChatHistReport,
  doExportAllChatHistories
} from './integrations/chat-integration';

import {
  getListOfUsers,
  postNewUser,
  // optionally you may import update/delete integration if you like
} from './integrations/user-integration';

// Import webhook configuration
import { getWebhookUrl, isWebhookAssistant } from './webhookConfig';


// ====== Small HTTP helper ======
async function request(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ====== Auth storage ======
const LS_TOKEN = "ulink.auth.token";
const LS_USER = "ulink.auth.user";

export function setAuth(token, user) {
  if (token) localStorage.setItem(LS_TOKEN, token);
  if (user) localStorage.setItem(LS_USER, JSON.stringify(user));
}

export function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(LS_USER) || "null");
  }
  catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_CHAT);
  localStorage.removeItem(LS_BOT_LABELS);
}

// ====== Auth API ======
export async function login(username, password) {
  const data = await request(LOGIN_PATH, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  const token = data.token;
  const user = data.user || (data.username ? { username, username: data.username } : { username });
  if (!token) throw new Error("No token in response");
  setAuth(token, user);
  return user;
}

export async function register(username, password) {
  const data = await request(REGISTER_PATH, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return data;
}

export async function fetchProfile() {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return request(PROFILE_PATH, {
    headers: { Authorization: `Bearer ${token}` },
  });
}



/* ====================================================================
   Chat console (frontend-only, localStorage) + Editable bot names
   ==================================================================== */

// Bot label storage (user edits)
const LS_BOT_LABELS = "ulink.chat.botLabels";
function loadBotLabels() {
  try { return JSON.parse(localStorage.getItem(LS_BOT_LABELS) || "{}"); }
  catch { return {}; }
}

function saveBotLabels(map) {
  localStorage.setItem(LS_BOT_LABELS, JSON.stringify(map || {}));
}

// Public helpers for UI
export async function listChatbots(filter = "") {
  const user = getUser();
  const userId = user?.id;

  const listOfAssistant = await getListOfAssistant(userId);

  const out = listOfAssistant.map(b => {
    const assistMap = (
      {
        key: b._id,
        name: b.displayName,
        defaultName: b.displayName,
        isFirstReply: b.isFirstReply
      }
    );

    return assistMap;
  });

  if (!filter) return out;
  const q = filter.toLowerCase();

  return out.filter(b =>
    (b.name || "").toLowerCase().includes(q) ||
    (b.defaultName || "").toLowerCase().includes(q) ||
    (b.key || "").toLowerCase().includes(q)
  );
}

export function getBotName(key, assistantList = []) {
  const lbl = loadBotLabels()[key];
  if (lbl && lbl.trim()) return lbl.trim();
  return assistantList.find(b => b.key === key)?.name || "Chatbot";
}

export function setBotName(key, newName) {
  const map = loadBotLabels();
  const trimmed = String(newName || "").trim();
  if (!trimmed) {
    // reset to default
    delete map[key];
  } else {
    map[key] = trimmed;
  }
  saveBotLabels(map);
  // convenience: return current list (note: this returns a Promise because listChatbots is async)
  return listChatbots();
}

// ====== Chat sessions (localStorage) ======
const LS_CHAT = "ulink.chat.v1";

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(LS_CHAT)) || { sessions: [] };
  }
  catch {
    return {
      sessions: []
    };
  }
}

function saveState(state) {
  localStorage.setItem(LS_CHAT, JSON.stringify(state));
}

export async function listSessions(botKey) {

  const user = getUser();
  const userId = user?.id;

  let sessionBotStorage = (loadState().sessions || [])
    .filter(s => s.botKey === botKey)
    .sort((a, b) => (new Date(b.updatedAt)) - (new Date(a.updatedAt)));

  if (!sessionBotStorage || sessionBotStorage.length === 0) {
    // if session does not exist, retrieve from backend
    const backendSession = await retrieveChatHistory({ userId, assistantId: botKey });

    if (backendSession && backendSession.length > 0) {
      sessionBotStorage = backendSession.map((data) => {
        return {
          id: data?.sessionId,
          botKey: data?.assistantId,
          title: data?.title,
          messages: data?.messages || [],
          createdAt: data?.createdAt,
          updatedAt: data?.updatedAt
        };
      });

      const state = loadState();
      state.sessions.push(...sessionBotStorage);
      saveState(state);
    }
  }

  return sessionBotStorage;
}

export async function createSession(assistantId) {
  const state = loadState();
  const authUser = getUser();

  let session;

  // For webhook-based assistants, create session locally (no backend needed)
  if (isWebhookAssistant(assistantId)) {
    const localId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    session = {
      id: localId,
      botKey: assistantId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Best-effort: also persist to backend (don't block on failure)
    try {
      const newSessionBE = await postNewSession({ assistantId, userId: authUser?.id });
      if (newSessionBE?.sessionId) {
        session.id = newSessionBE.sessionId;
        session.title = newSessionBE.title || session.title;
        session.createdAt = newSessionBE.createdAt || session.createdAt;
        session.updatedAt = newSessionBE.updatedAt || session.updatedAt;
      }
    } catch (err) {
      console.warn('Backend session creation failed (using local session):', err.message);
    }
  } else {
    // Non-webhook assistants: require backend session
    const newSessionBE = await postNewSession({
      assistantId,
      userId: authUser?.id
    });

    session = {
      id: newSessionBE?.sessionId,
      botKey: assistantId,
      title: newSessionBE?.title,
      messages: [],
      createdAt: newSessionBE?.createdAt,
      updatedAt: newSessionBE?.updatedAt
    };
  }

  state.sessions.push(session);
  saveState(state);
  return session;
}

export function getSession(id) {
  return loadState().sessions.find(s => s.id === id) || null;
}

export function appendMessage(sessionId, role, content) {
  const state = loadState();
  const session = state.sessions.find(s => s.id === sessionId);

  if (!session) return null;
  session.messages.push({ role, content, createdAt: Date.now() });

  session.updatedAt = Date.now();

  saveState(state);

  return session;
}

function fallbackTitle(message) {
  const t = String(message || "").trim().replace(/\s+/g, " ");
  return t.length > 50 ? t.slice(0, 47) + "..." : (t || "New chat");
}

// Demo reply for now — replace with real backend call later.
export async function sendMessage(botKey, sessionId, text, setIsTyping, setSessions, attachmentFiles = [], isFirstReply = false) {
  // Check if this is a webhook-based assistant
  if (isWebhookAssistant(botKey)) {
    return await sendWebhookMessage(botKey, sessionId, text, setIsTyping, setSessions, attachmentFiles, isFirstReply);
  }

  // Update Chat title API
  const state = loadState();
  const existingSession = state.sessions.find(s => s.id === sessionId);
  if (existingSession?.messages?.length === 0) {

    let title = fallbackTitle(text);
    if (isFirstReply) {
      title = 'Upload Documents';
    }

    try {
      await doUpdateChatTitle({ sessionId, title });
    } catch (err) {
      console.warn("doUpdateChatTitle failed:", err);
    }

    existingSession.title = title;

    saveState(state);
  }

  if (text && !isFirstReply) {
    appendMessage(sessionId, "user", text);
  }

  const authUser = getUser();
  const userId = authUser?.id;

  setSessions(await listSessions(botKey));
  setIsTyping(true);

  // Call Chat Stream API
  let reply = 'Error on Backend/OpenAI Rate Limitting, please retry at another time.';
  try {
    reply = await postChatStreamingV2API({
      assistantId: botKey,
      sessionId,
      message: text,
      userId
    }, attachmentFiles);
  } catch (error) {
    console.log(error);
  }

  // give response buffer typing before display the actual message
  setIsTyping(false);
  appendMessage(sessionId, "assistant", reply);
  setSessions(await listSessions(botKey));

  return reply;
}

/**
 * Send message to N8N webhook-based assistant
 */
async function sendWebhookMessage(botKey, sessionId, text, setIsTyping, setSessions, attachmentFiles = [], isFirstReply = false) {
  // Update Chat title API
  const state = loadState();
  const existingSession = state.sessions.find(s => s.id === sessionId);
  if (existingSession?.messages?.length === 0) {
    let title = fallbackTitle(text);
    if (isFirstReply) {
      title = 'New Conversation';
    }

    try {
      await doUpdateChatTitle({ sessionId, title });
    } catch (err) {
      console.warn("doUpdateChatTitle failed:", err);
    }

    existingSession.title = title;
    saveState(state);
  }

  if (text && !isFirstReply) {
    appendMessage(sessionId, "user", text);
  }

  const authUser = getUser();
  const userId = authUser?.id;

  setSessions(await listSessions(botKey));
  setIsTyping(true);

  // Get webhook URL for this assistant
  const webhookUrl = getWebhookUrl(botKey);

  let reply = 'Error: Unable to connect to assistant.';

  try {
    if (!webhookUrl || webhookUrl.startsWith('PLACEHOLDER')) {
      throw new Error('Webhook URL not configured for this assistant.');
    }

    // Determine country based on assistant key
    const country = botKey === 'sg-doctor' ? 'SG' : 'MY';

    // Build payload matching n8n 'Validate Input' node requirements:
    // Required: condition (the medical condition the user described)
    // Optional: hospital, state, country
    const payload = {
      // Map user's message to 'condition' — what n8n expects
      condition: text,
      message: text,           // keep for compatibility
      hospital: '',            // user can extend this later
      state: '',               // user can extend this later
      country,
      // Session context
      sessionId,
      userId,
      assistantKey: botKey,
      timestamp: new Date().toISOString()
    };

    // Handle file attachments if any
    if (attachmentFiles && attachmentFiles.length > 0) {
      payload.hasAttachments = true;
      payload.attachmentCount = attachmentFiles.length;
    }

    // Call N8N webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}`);
    }

    const data = await response.json();

    // Extract reply — n8n workflow returns 'formatted_text' as the main response
    reply = data.formatted_text
      || data.reply
      || data.message
      || data.response
      || (data.recommendations ? JSON.stringify(data.recommendations, null, 2) : null)
      || 'Response received from assistant.';

  } catch (error) {
    console.error('Webhook error:', error);
    reply = `Error: ${error.message}`;
  }

  // give response buffer typing before display the actual message
  setIsTyping(false);
  appendMessage(sessionId, "assistant", reply);
  setSessions(await listSessions(botKey));

  return reply;
}


export async function doExportChat(sessionId) {
  await doDownloadChatHistReport(sessionId);
}

export async function doBackUpAllChat({ setSessions, botKey }) {

  // Call Export All Chat API
  await doExportAllChatHistories();

  // Reload State
  localStorage.removeItem(LS_CHAT);
  if (botKey) {
    setSessions(await listSessions(botKey));
  }
}

// --- Admin (requires token) ---
// Note: frontend expects users to have `assistantIds` array. Some backends may
// return `allowedAssistantIds` or similar legacy fields. We normalize here.

function normalizeUser(u = {}) {
  // prefer assistantIds, fallback to allowedAssistantIds
  const assistantIds = u.assistantIds || u.allowedAssistantIds || u.assistants || [];
  return {
    ...u,
    assistantIds: Array.isArray(assistantIds) ? assistantIds : [],
    // keep legacy fields around for UI compatibility
    allowedAssistantIds: Array.isArray(assistantIds) ? assistantIds : (u.allowedAssistantIds || [])
  };
}

export async function adminListUsers() {
  // getListOfUsers() is your integration - it may call backend API and return users.
  const users = await getListOfUsers();
  if (!Array.isArray(users)) return [];
  return users.map(normalizeUser);
}

/**
 * Create new user or update existing user
 * - If `id` is provided, this will call PUT /api/users/:id (update)
 * - If no `id` provided, will call postNewUser(...) (create)
 *
 * Accepts either `assistantIds` or `allowedAssistantIds` (normalized).
 * Enforces at least one assistant assigned.
 */
export async function adminCreateUser({ username, password, assistantIds = [], allowedAssistantIds = [], id } = {}) {
  // normalize input assistant array
  const aIds = Array.isArray(assistantIds) && assistantIds.length > 0
    ? assistantIds
    : (Array.isArray(allowedAssistantIds) ? allowedAssistantIds : []);

  if (!Array.isArray(aIds) || aIds.length === 0) {
    throw new Error("At least one assistant must be assigned to the user.");
  }

  // create
  if (!id) {
    // use your integration helper for creating user
    const created = await postNewUser({
      username,
      password,
      assistantIds: aIds
    });
    return normalizeUser(created || {});
  }

  // update existing user via API PUT
  const token = getToken();
  if (!token) throw new Error("Not authenticated (missing token)");

  const payload = { username, assistantIds: aIds };
  if (password) payload.password = password;

  const updated = await request(`/api/users/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  return normalizeUser(updated || {});
}

/**
 * Explicit update helper (alternative)
 */
export async function adminUpdateUser(userId, { username, assistantIds = [], password } = {}) {
  if (!Array.isArray(assistantIds) || assistantIds.length === 0) {
    throw new Error("At least one assistant must be assigned to the user.");
  }
  const token = getToken();
  if (!token) throw new Error("Not authenticated (missing token)");

  const payload = { username, assistantIds };
  if (password) payload.password = password;

  const updated = await request(`/api/users/${userId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });

  return normalizeUser(updated || {});
}

export async function adminDeleteUser(userId) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated (missing token)");
  return request(`/api/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function adminResetUserPassword(userId, newPassword) {
  const token = getToken();
  return request(`/api/users/${userId}/reset-password`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password: newPassword }),
  });
}
