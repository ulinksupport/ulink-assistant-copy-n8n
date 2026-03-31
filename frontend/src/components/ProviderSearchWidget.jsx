// src/components/ProviderSearchWidget.jsx
// Guided multi-step provider search chat — mirrors the DoctorChatWidget flow
import React, { useEffect, useRef, useState } from 'react';
import { getWebhookUrl } from '../webhookConfig';
import { createSession, appendMessage, getSession, listSessions } from '../api';
import './ProviderSearchWidget.css'; // Reuse or define similar CSS

// ── Service Type Data ─────────────────────────────────────────────────────────
const SERVICE_TYPES = [
    { label: 'Assistance', value: 'Assistance' },
    { label: 'Commercial', value: 'Commercial' },
    { label: 'Escort', value: 'Escort' },
    { label: 'AA/RMR', value: 'AA_RMR' },
    { label: 'Other Services', value: 'Other Services' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function linkify(url) {
    if (!url || url === 'N/A') return 'N/A';
    const safe = escHtml(url);
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
}

// ── Provider cards ─────────────────────────────────────────────────────────────
function renderProviderCards(data) {
    const recs = data.providers || data.recommendations || [];
    if (recs.length === 0) return null;

    return recs.map((r, i) => (
        <div className="ps-card" key={i}>
            <div className="rec-label">Provider {r.provider_number || i + 1}</div>
            <div className="doc-name">{r.provider_name || r.name}</div>
            <table><tbody>
                {r.service_type && <tr><td>Service Type</td><td>{r.service_type}</td></tr>}
                {r.country && <tr><td>Country</td><td>{r.country}</td></tr>}
                {r.contact_number && <tr><td>Contact</td><td>{r.contact_number}</td></tr>}
                {r.email && <tr><td>Email</td><td>{r.email}</td></tr>}
                {r.remarks && <tr><td>Remarks</td><td>{r.remarks}</td></tr>}
                {r.website && <tr><td>Website</td>
                    <td dangerouslySetInnerHTML={{ __html: linkify(r.website) }} />
                </tr>}
            </tbody></table>
            {r.source_file && <div className="source-badge">Source: {r.source_file}</div>}
        </div>
    ));
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ msg }) {
    if (msg.type === 'typing') {
        return (
            <div className="ps-msg bot">
                <div className="ps-avatar">U</div>
                <div className="ps-bubble">
                    <div className="ps-typing"><span /><span /><span /></div>
                </div>
            </div>
        );
    }

    const isBot = msg.role === 'bot';

    // Try to parse saved card data (stored as JSON string in history)
    let cardData = msg.cards;
    if (!cardData && msg.content) {
        try {
            const parsed = JSON.parse(msg.content);
            if (parsed && parsed.__providerCards) cardData = parsed;
        } catch (_) { /* not JSON */ }
    }

    // Derive display text
    const displayText = msg.text || msg.content || '';

    return (
        <div className={`ps-msg ${isBot ? 'bot' : 'user'}`}>
            <div className="ps-avatar">{isBot ? 'U' : 'A'}</div>
            <div className="ps-bubble">
                {msg.html
                    ? <div dangerouslySetInnerHTML={{ __html: msg.html }} />
                    : displayText && <p>{displayText}</p>}
                {cardData && <div className="ps-cards">{renderProviderCards(cardData)}</div>}
                {msg.createdAt && (
                    <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
                        {new Date(msg.createdAt).toLocaleString()}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function ProviderSearchWidget({ botKey, sessionId, onSessionCreated }) {
    const [messages, setMessages] = useState([]);
    const [quickReplies, setReplies] = useState([]);
    const [showInput, setShowInput] = useState(false);
    const [inputVal, setInputVal] = useState('');
    const [inputPlaceholder, setPlaceholder] = useState('Type your response…');
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [isHistory, setIsHistory] = useState(false); // read-only mode

    const flowState = useRef({ selectedService: '', searchInput: '' });
    const pendingStep = useRef('');
    const activeSessionId = useRef(null);
    const endRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, quickReplies]);

    // When sessionId prop changes: show history or start fresh
    useEffect(() => {
        if (sessionId) {
            loadHistorySession(sessionId);
        } else {
            setIsHistory(false);
            resetFlow();
        }
    }, [sessionId, botKey]);

    // ── History mode ──────────────────────────────────────────────────────────
    function loadHistorySession(sid) {
        const session = getSession(sid);
        if (!session) { resetFlow(); return; }

        setIsHistory(true);
        setReplies([]);
        setShowInput(false);
        setStep(3);

        const msgs = (session.messages || []).map((m, i) => {
            let text = m.content || '';
            let cards = null;
            let html = null;
            try {
                const parsed = JSON.parse(m.content);
                if (parsed && parsed.__providerCards) {
                    cards = parsed;
                    text = '';
                }
            } catch (_) { /* plain text */ }

            return {
                id: m.id || `hist-${i}`,
                role: m.role === 'user' ? 'user' : 'bot',
                text,
                html,
                cards,
                createdAt: m.createdAt,
            };
        });

        setMessages(msgs);
    }

    // ── Flow helpers ─────────────────────────────────────────────────────────
    function addBotMsg(text, extra = {}) {
        const msg = { role: 'bot', text, ...extra, id: Date.now() + Math.random() };
        setMessages(prev => [...prev, msg]);
        if (activeSessionId.current) {
            appendMessage(activeSessionId.current, 'assistant', text);
        }
    }

    function addUserMsg(text) {
        const msg = { role: 'user', text, id: Date.now() + Math.random() };
        setMessages(prev => [...prev, msg]);
        if (activeSessionId.current) {
            appendMessage(activeSessionId.current, 'user', text);
        }
    }

    function showQuickReplies(options) { setReplies(options); setShowInput(false); setInputVal(''); }
    function showTextInput(placeholder) {
        setReplies([]); setShowInput(true); setPlaceholder(placeholder || 'Type your response…');
        setTimeout(() => inputRef.current?.focus(), 100);
    }
    function hide() { setReplies([]); setShowInput(false); }

    // ── Conversation flow ─────────────────────────────────────────────────────
    async function resetFlow() {
        flowState.current = { selectedService: '', searchInput: '' };
        pendingStep.current = '';
        activeSessionId.current = null;
        setMessages([]);
        setReplies([]);
        setShowInput(false);
        setInputVal('');
        setStep(1);
        setIsHistory(false);

        try {
            const session = await createSession(botKey);
            activeSessionId.current = session.id;
            if (onSessionCreated) {
                const sessions = await listSessions(botKey);
                onSessionCreated(sessions);
            }
        } catch (err) {
            console.warn('Could not create session for provider search:', err.message);
        }

        addBotMsg(`Hello! I'm the Ulink Provider Search Assistant. I'll help you find providers from our internal panels.`);
        askServiceType();
    }

    function askServiceType() {
        setStep(1);
        addBotMsg('What type of service are you searching for?');
        showQuickReplies(SERVICE_TYPES);
        pendingStep.current = 'service-type';
    }

    function handleServiceChoice(val) {
        flowState.current.selectedService = val;
        askSearchDetails();
    }

    function askSearchDetails() {
        setStep(2);
        addBotMsg(`You selected ${flowState.current.selectedService}. Please provide the location or search criteria (e.g., "Bangkok", "Evacuation flight from Singapore", etc.).`);
        showTextInput('Type location or criteria…');
        pendingStep.current = 'search-details';
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    function handleSend() {
        const val = inputVal.trim();
        if (!val) return;
        addUserMsg(val);
        setInputVal('');
        hide();

        if (pendingStep.current === 'search-details') {
            flowState.current.searchInput = val;
            fetchRecommendation(val);
        }
        pendingStep.current = '';
    }

    function handleQuickReply(opt) {
        addUserMsg(opt.label || opt.value);
        hide();
        const ps = pendingStep.current;

        if (ps === 'service-type') {
            handleServiceChoice(opt.value);
        } else if (ps === 'done-choice' && opt.value === 'restart') {
            resetFlow();
        } else if (ps === 'not-found-choice' && opt.value === 'restart') {
            resetFlow();
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') handleSend();
    }

    // ── API ───────────────────────────────────────────────────────────────────
    async function fetchRecommendation(searchInput) {
        setStep(3);
        setLoading(true);
        const typingId = Date.now() + Math.random();
        setMessages(prev => [...prev, { id: typingId, type: 'typing' }]);

        const webhookUrl = getWebhookUrl(botKey);
        const payload = {
            serviceType: flowState.current.selectedService,
            searchQuery: searchInput
        };

        try {
            const res = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            setMessages(prev => prev.filter(m => m.id !== typingId));
            displayRecommendations(data, searchInput);
        } catch (err) {
            setMessages(prev => prev.filter(m => m.id !== typingId));
            addBotMsg(`⚠️ Sorry, I couldn't connect to the provider search service.\nError: ${err.message}`);
            showQuickReplies([{ label: '🔄 Start New Search', value: 'restart' }]);
            pendingStep.current = 'done-choice';
        } finally {
            setLoading(false);
        }
    }

    function displayRecommendations(data, searchInput) {
        const recs = data.providers || data.recommendations || [];

        if (!data || data.outcome === 'not_found' || recs.length === 0) {
            addBotMsg(`I couldn't find any provider matching "${searchInput}" for ${flowState.current.selectedService} in the internal panels. What would you like to do?`);
            showQuickReplies([
                { label: '🔄 Start Over', value: 'restart' }
            ]);
            pendingStep.current = 'not-found-choice';
            return;
        }

        // Save card data as JSON so it survives in history
        const cardJson = JSON.stringify({ ...data, __providerCards: true });
        if (activeSessionId.current) {
            appendMessage(activeSessionId.current, 'assistant', cardJson);
        }

        setMessages(prev => [...prev, {
            role: 'bot', text: '', cards: data, id: Date.now(),
        }]);

        addBotMsg('Here are your provider results! ⚠️ Please verify the panel tier and contact numbers before proceeding.');
        showQuickReplies([{ label: '🔄 New Search', value: 'restart' }]);
        pendingStep.current = 'done-choice';

        // Refresh history sidebar after saving
        if (onSessionCreated) {
            listSessions(botKey).then(sessions => onSessionCreated(sessions)).catch(() => { });
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    const stepLabel = { 1: 'Step 1 — Service', 2: 'Step 2 — Criteria', 3: 'Step 3 — Results' };

    return (
        <div className="ps-widget">
            {/* Step progress */}
            <div className="ps-steps">
                {[1, 2, 3].map(n => (
                    <div key={n} className={`ps-dot ${n < step ? 'done' : n === step ? 'active' : ''}`} />
                ))}
                <span className="ps-step-label">
                    {isHistory ? '📋 History View' : stepLabel[step]}
                </span>
                {isHistory && (
                    <button
                        className="ps-qr-btn"
                        style={{ marginLeft: 'auto', fontSize: 11 }}
                        onClick={() => { activeSessionId.current = null; resetFlow(); }}
                    >
                        🔄 New Search
                    </button>
                )}
            </div>

            {/* Chat Area */}
            <div className="ps-chat-area">
                <div className="ps-messages">
                    {messages.map(m => <Bubble key={m.id} msg={m} />)}
                    <div ref={endRef} style={{ height: 1 }} />
                </div>
            </div>

            {/* Input Area */}
            {!isHistory && (
                <div className="ps-input-area">
                    {quickReplies.length > 0 && (
                        <div className="ps-qr-list">
                            {quickReplies.map((qr, i) => (
                                <button key={i} className="ps-qr-btn" onClick={() => handleQuickReply(qr)}>
                                    {qr.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {showInput && (
                        <div className="ps-input-row" style={{ opacity: loading ? 0.5 : 1 }}>
                            <input
                                ref={inputRef}
                                type="text"
                                className="ps-input"
                                placeholder={inputPlaceholder}
                                value={inputVal}
                                onChange={e => setInputVal(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={loading}
                            />
                            <button
                                className="ps-send-btn"
                                onClick={handleSend}
                                disabled={!inputVal.trim() || loading}
                            >
                                Send
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
