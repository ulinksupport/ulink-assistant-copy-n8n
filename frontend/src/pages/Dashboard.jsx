// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../components/utils/ChatUploadButton.css";

import {
  getToken,
  clearAuth,
  getUser,
  getBotName,
  listChatbots,
  listSessions,
  createSession,
  getSession,
  sendMessage,
  doExportChat,
  doBackUpAllChat,
} from "../api.js";

import ChatUploadButton from "../components/utils/ChatUploadButton";
import { TypingDots } from "../components/utils/TypingDots.jsx";
import LoadingSpinner from "../components/utils/LoadingSpinner.jsx";
import AdminPanel from "./AdminPanel.jsx";
import { getWebhookAssistants } from "../webhookConfig.js";
import DoctorChatWidget from "../components/DoctorChatWidget.jsx";

// Keys that use the guided doctor chat widget
const DOCTOR_KEYS = ['sg-doctor', 'my-doctor'];

// Keep only 2 iframe assistants
const LINDY_EMBED_ASSISTANT = {
  key: "lindy-embed",
  name: "Ulink Pre-Claim Assessment Engine",
};



const HR_CLAIM_ASSISTANT = {
  key: "hr-claim",
  name: "HR Related (Claim)",
};

export default function Dashboard() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!getToken()) navigate("/login");
  }, [navigate]);

  const [filteredBots, setFilteredBots] = useState([]);
  const [botKey, setBotKey] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const endRef = useRef(null);
  const [sendDisabled, setSendDisabled] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // iframe refresh key (increment to force iframe reload)
  const [iframeRefreshKey, setIframeRefreshKey] = useState(0);

  const user = getUser();
  const isAdmin = user?.role === "admin";

  // handle files from ChatUploadButton
  const onPickFiles = (files) => {
    const withIds = files.map((f) => ({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      file: f,
    }));
    setAttachments((prev) => [...prev, ...withIds]);
  };

  const removeAttachment = (id) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // load sessions when botKey changes (except when selecting Allianz CSO iframe or Ulink iframe)
  useEffect(() => {
    if (!botKey) {
      setSessions([]);
      setSessionId("");
      return;
    }

    if (
      botKey === LINDY_EMBED_ASSISTANT.key ||
      botKey === HR_CLAIM_ASSISTANT.key
    ) {
      setSessions([]);
      setSessionId("");
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const sessionList = await listSessions(botKey);
        if (mounted) setSessions(sessionList || []);
      } catch (err) {
        console.error("Failed to list sessions:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [botKey]);

  // load only webhook + iframe assistants (not from backend to avoid duplicates)
  useEffect(() => {
    const out = [];

    // Add 5 webhook-based assistants
    const webhookAssistants = getWebhookAssistants();
    webhookAssistants.forEach(assistant => {
      out.push(assistant);
    });

    // Add iframe assistants
    out.push(LINDY_EMBED_ASSISTANT);
    out.push(HR_CLAIM_ASSISTANT);

    setFilteredBots(out);
  }, []);

  const currentSession = useMemo(
    () => (sessionId ? getSession(sessionId) : null),
    [sessionId, sessions]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionId, currentSession?.messages, sessions]);

  async function onNewChat() {
    if (
      !botKey ||
      botKey === LINDY_EMBED_ASSISTANT.key ||
      botKey === HR_CLAIM_ASSISTANT.key
    )
      return;
    setLoading(true);
    try {
      const s = await createSession(botKey);
      const freshSessions = await listSessions(botKey);
      setSessions(freshSessions || []);
      setSessionId(s.id);
      setSendDisabled(false);
      setInput("");

      const currentAssistant = filteredBots.find((b) => b.key === botKey);
      if (currentAssistant?.isFirstReply) {
        try {
          await sendMessage(
            botKey,
            s.id,
            "Hi",
            setIsTyping,
            setSessions,
            [],
            true
          );
        } catch (err) {
          console.error("Error sending initial reply:", err);
        }
      }
    } catch (err) {
      console.error("Failed to create new session:", err);
      alert("Failed to create chat. See console for details.");
    } finally {
      setLoading(false);
    }
  }

  async function doExportAll() {
    const confirmBackup = window.confirm(
      "Are you sure you want to backup? Once backed up, all chat history will be uploaded into Zoho Work Drive & deleted from system."
    );
    if (!confirmBackup) return;

    setLoading(true);
    try {
      await doBackUpAllChat({ setSessions, botKey });
      alert("Chat successfully backed up into Zoho Work Drive.");
    } catch (err) {
      console.error("Backup failed:", err);
      alert("Backup failed. See console for details.");
    } finally {
      setLoading(false);
    }
  }

  async function onSend(e) {
    e.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setUploading(true);

    const text = input.trim();
    if ((!text && attachments?.length === 0) || !botKey || !sessionId) {
      setIsSending(false);
      setUploading(false);
      return;
    }

    setSendDisabled(true);
    const attachmentFiles = attachments.map((a) => a.file);
    try {
      await sendMessage(
        botKey,
        sessionId,
        text,
        setIsTyping,
        setSessions,
        attachmentFiles,
        false
      );
      setAttachments([]);
      setInput("");
    } catch (err) {
      console.error("Failed to send message:", err);
      alert("Failed to send message. See console for details.");
    } finally {
      setUploading(false);
      setSendDisabled(false);
      setIsSending(false);
    }
  }

  async function doExportChatEvent() {
    if (!sessionId) return;
    setLoading(true);
    try {
      await doExportChat(sessionId);
      alert("Export completed.");
    } catch (err) {
      console.error("Export chat failed:", err);
      alert("Export failed. See console for details.");
    } finally {
      setLoading(false);
    }
  }

  const btnSendDisabled =
    !botKey || !sessionId || (!input.trim() && attachments?.length === 0);

  // Render the Ulink Pre-Claim Assessment Engine launcher card
  const renderUlinkIframe = () => {
    const url = "https://preclaim-custom-gpt.onrender.com/";
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 520,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: "40px 24px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          borderRadius: 16,
          boxShadow: "0 8px 28px rgba(16,24,40,0.12)",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "linear-gradient(135deg, #f97316, #ea580c)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, boxShadow: "0 8px 24px rgba(249,115,22,0.4)"
        }}>
          🩺
        </div>

        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
            Ulink Pre-Claim Assessment Engine
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", maxWidth: 400 }}>
            Upload medical documents or enter case details — AI generates a full assessment with
            internal summary, client report, and email template.
          </div>
        </div>

        {/* Launch button */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "14px 32px", borderRadius: 10,
            background: "linear-gradient(135deg, #f97316, #ea580c)",
            color: "#fff", fontWeight: 700, fontSize: 16,
            textDecoration: "none",
            boxShadow: "0 4px 16px rgba(249,115,22,0.4)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(249,115,22,0.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 16px rgba(249,115,22,0.4)"; }}
        >
          🚀 Open Pre-Claim Engine
        </a>

        <div style={{ fontSize: 12, color: "#475569" }}>
          Opens in a new tab — file upload and AI analysis work fully there
        </div>
      </div>
    );
  };



  const renderHrClaimIframe = () => {
    const src = "https://oil-8b06.onrender.com";
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minHeight: 520,
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 28px rgba(16,24,40,0.08)",
        }}
      >
        <iframe
          key={iframeRefreshKey}
          src={src}
          width="100%"
          height="100%"
          style={{ border: "none", display: "block", minHeight: 520 }}
          title="HR Related (Claim)"
        />
      </div>
    );
  };

  return (
    <div className="console-page">
      <div className="console-wrap">
        <div className="console-grid">
          {/* Left panel */}
          <aside className="sidebar">
            <div className="stack">
              <label style={{ fontWeight: 700 }}>Assistant</label>
              <select
                className="input"
                value={botKey}
                onChange={(e) => setBotKey(e.target.value)}
                aria-label="Select assistant"
              >
                <option value="">— Select an assistant —</option>
                {filteredBots.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.name}
                  </option>
                ))}
              </select>

              <div className="row">
                <button
                  className="button ghost"
                  disabled={
                    !botKey ||
                    botKey === LINDY_EMBED_ASSISTANT.key ||
                    botKey === MEDICAL_BILL_ASSISTANT.key
                  }
                  onClick={onNewChat}
                >
                  New chat
                </button>

                {isAdmin && (
                  <button
                    className="button ghost"
                    onClick={doExportAll}
                    aria-busy={loading}
                    disabled={loading}
                    title="Backup all chats to Zoho Work Drive and remove local copies"
                  >
                    {loading ? "Backing up..." : "Backup"}
                  </button>
                )}
              </div>
            </div>

            <div style={{ fontWeight: 700, marginTop: 10 }}>History</div>
            <div className="history">
              {botKey === LINDY_EMBED_ASSISTANT.key ? (
                <div className="muted">
                  Ulink Pre-Claim Assessment AI — interaction inside the right
                  panel.
                </div>
              ) : botKey === HR_CLAIM_ASSISTANT.key ? (
                <div className="muted">
                  HR Related (Claim) — interaction inside the right panel.
                </div>
              ) : sessions.length === 0 ? (
                <div className="muted">No chats yet.</div>
              ) : (
                sessions.map((s) => {
                  const updatedAt = s.updatedAt
                    ? new Date(s.updatedAt).toLocaleString()
                    : "";
                  return (
                    <button
                      key={s.id}
                      className={
                        "history-item" + (s.id === sessionId ? " active" : "")
                      }
                      onClick={() => setSessionId(s.id)}
                    >
                      <div className="title">{s.title || "Untitled"}</div>
                      <div className="meta">{updatedAt}</div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right panel */}
          <section className="chat">
            <div className="chat-header">
              <div
                className="row"
                style={{ gap: 8, alignItems: "center" }}
              >
                <div className="logo-ring small" aria-hidden />
                <strong>
                  {botKey
                    ? getBotName(botKey, filteredBots)
                    : "Pick an assistant"}
                </strong>
              </div>

              <div className="row" style={{ gap: 8 }}>
                {/* NEW Allianz button */}
                <button
                  className="button ghost"
                  onClick={() => navigate("/allianz/login")}
                >
                  Allianz
                </button>

                {isAdmin && (
                  <button
                    className="button ghost"
                    onClick={() => setShowAdmin(true)}
                  >
                    Admin Panel
                  </button>
                )}
                <button
                  className="button ghost"
                  onClick={() => {
                    clearAuth();
                    navigate("/login");
                  }}
                >
                  Logout
                </button>

                <button
                  className="button ghost"
                  disabled={!sessionId}
                  onClick={doExportChatEvent}
                >
                  Export Chat
                </button>
              </div>
            </div>

            <div
              className="chat-messages"
              style={{ position: "relative", minHeight: 320, padding: DOCTOR_KEYS.includes(botKey) ? 0 : undefined }}
              role="log"
              aria-live="polite"
            >
              {botKey === LINDY_EMBED_ASSISTANT.key ? (
                renderUlinkIframe()
              ) : botKey === HR_CLAIM_ASSISTANT.key ? (
                renderHrClaimIframe()
              ) : DOCTOR_KEYS.includes(botKey) ? (
                /* ── Guided doctor chat widget ── */
                <DoctorChatWidget
                  key={botKey}
                  botKey={botKey}
                  sessionId={sessionId || null}
                  onSessionCreated={(newSessions) => setSessions(newSessions || [])}
                />
              ) : (
                <>
                  {!botKey ? (
                    <div className="muted">Select an assistant to start.</div>
                  ) : !sessionId ? (
                    <div className="muted">
                      Create a new chat or pick one from history.
                    </div>
                  ) : (
                    (currentSession?.messages || []).map((m, index) => {
                      const key =
                        m.id || `${m.role}-${m.createdAt || index}-${index}`;
                      const roleClass =
                        m.role === "user" ? "user" : "assistant";
                      return (
                        <div key={key} className={`bubble ${roleClass}`}>
                          <div className="bubble-inner">
                            <p>{m.content}</p>
                            {m.createdAt && (
                              <div
                                className="msg-meta"
                                style={{ fontSize: 12, opacity: 0.6 }}
                              >
                                {new Date(m.createdAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {isTyping && <TypingDots />}
                  <div ref={endRef} />
                </>
              )}
            </div>

            {botKey !== LINDY_EMBED_ASSISTANT.key &&
              !DOCTOR_KEYS.includes(botKey) && (
                <form className="composer" onSubmit={onSend}>
                  <div className="upload-button-wrap">
                    <ChatUploadButton
                      disabled={!botKey || !sessionId || sendDisabled || uploading}
                      fileCount={attachments.length}
                      onFiles={onPickFiles}
                    />
                  </div>

                  <input
                    className="input input-message"
                    placeholder={
                      !botKey ? "Choose an assistant first" : "Type a message…"
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={!botKey || !sessionId || sendDisabled || uploading}
                    aria-label="Message"
                  />
                  <button
                    className="button primary send-btn"
                    disabled={btnSendDisabled || sendDisabled || uploading}
                    aria-disabled={btnSendDisabled || sendDisabled || uploading}
                  >
                    {isSending ? "Sending..." : "Send"}
                  </button>

                  <div className="attachments-row" aria-live="polite">
                    {attachments.map(({ id, file }) => (
                      <div key={id} className="chip" title={file.name}>
                        <span className="chip-icon">📎</span>
                        <span className="chip-name">{file.name}</span>
                        <button
                          type="button"
                          className="chip-remove"
                          onClick={() => removeAttachment(id)}
                          aria-label={`Remove attachment ${file.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </form>
              )}
          </section>
        </div>
      </div>

      <LoadingSpinner show={loading} />
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
