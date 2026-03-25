// src/components/DoctorChatWidget.jsx
// Guided multi-step doctor recommendation chat — mirrors the n8n.html flow
// Supports history: saves conversations to localStorage, reads them back when sessionId is provided
import React, { useEffect, useRef, useState } from 'react';
import { getWebhookUrl } from '../webhookConfig';
import { createSession, appendMessage, getSession, listSessions } from '../api';
import './DoctorChatWidget.css';

// ── Location / hospital data ─────────────────────────────────────────────────
const MY_STATES = [
    { label: '1. Kuala Lumpur', value: 'Kuala Lumpur' },
    { label: '2. Selangor', value: 'Selangor' },
    { label: '3. Penang', value: 'Penang' },
    { label: '4. Malacca', value: 'Malacca' },
    { label: '5. Johor', value: 'Johor' },
    { label: '6. Unsure', value: 'Unsure' },
];

const SG_STATES = [{ label: 'Singapore', value: 'Singapore' }];

const MY_HOSPITALS = {
    'Penang': ['Pantai Hospital Penang', 'Sunway Medical Penang', 'Not Listed'],
    'Kuala Lumpur': ['Cardiac Vascular Sentral KL', 'Gleneagles KL', 'Hospital Picaso',
        'Pantai Hospital KL', 'Prince Court Medical Centre', 'Sunway Medical KL', 'Not Listed'],
    'Selangor': ['Sunway Medical Centre Selangor', 'Thomson Hospital Kota Damansara', 'Not Listed'],
};

const SG_HOSPITALS = {
    'Singapore': ['Gleneagles Singapore', 'Mount Elizabeth Hospital', 'Raffles Hospital',
        'Singapore General Hospital', 'National University Hospital', 'Not Listed'],
};

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

// ── Doctor cards ─────────────────────────────────────────────────────────────
function renderDoctorCards(data) {
    const recs = data.recommendations || [];
    if (recs.length === 0) return null;

    return recs.map((r, i) => (
        <div className="doc-card" key={i}>
            <div className="rec-label">Recommendation {r.recommendation_number || i + 1}</div>
            <div className="doc-name">{r.doctor_name}</div>
            <div className="doc-hospital">{r.hospital}</div>
            <table><tbody>
                <tr><td>Condition</td>  <td>{r.medical_condition}</td></tr>
                <tr><td>Type</td>       <td>{r.type}</td></tr>
                <tr><td>Specialty</td>  <td>{r.specialty}</td></tr>
                {r.sub_specialty && <tr><td>Sub-specialty</td><td>{r.sub_specialty}</td></tr>}
                <tr><td>Hospital</td>   <td>{r.hospital}</td></tr>
                <tr><td>Location</td>   <td>{r.location}</td></tr>
                <tr><td>Website</td>
                    <td dangerouslySetInnerHTML={{ __html: linkify(r.website) }} />
                </tr>
            </tbody></table>
            {r.source_row && <div className="source-badge">Database Row {r.source_row}</div>}
        </div>
    ));
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ msg }) {
    if (msg.type === 'typing') {
        return (
            <div className="dc-msg bot">
                <div className="dc-avatar">U</div>
                <div className="dc-bubble">
                    <div className="dc-typing"><span /><span /><span /></div>
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
            if (parsed && parsed.__doctorCards) cardData = parsed;
        } catch (_) { /* not JSON */ }
    }

    // Derive display text
    const displayText = msg.text || msg.content || '';

    return (
        <div className={`dc-msg ${isBot ? 'bot' : 'user'}`}>
            <div className="dc-avatar">{isBot ? 'U' : 'A'}</div>
            <div className="dc-bubble">
                {msg.html
                    ? <div dangerouslySetInnerHTML={{ __html: msg.html }} />
                    : displayText && <p>{displayText}</p>}
                {cardData && <div className="dc-cards">{renderDoctorCards(cardData)}</div>}
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
/**
 * Props:
 *   botKey          — 'sg-doctor' | 'my-doctor'
 *   sessionId       — if set, show that historical session (read-only)
 *   onSessionCreated(sessions) — called after a new session is saved so sidebar refreshes
 */
export default function DoctorChatWidget({ botKey, sessionId, onSessionCreated }) {
    const isSG = botKey === 'sg-doctor';
    const country = isSG ? 'SG' : 'MY';
    const STATES = isSG ? SG_STATES : MY_STATES;
    const HOSPITALS = isSG ? SG_HOSPITALS : MY_HOSPITALS;

    const [messages, setMessages] = useState([]);
    const [quickReplies, setReplies] = useState([]);
    const [showInput, setShowInput] = useState(false);
    const [inputVal, setInputVal] = useState('');
    const [inputPlaceholder, setPlaceholder] = useState('Type your response…');
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [isHistory, setIsHistory] = useState(false); // read-only mode

    const flowState = useRef({ selectedState: '', selectedHospital: '', condition: '' });
    const pendingStep = useRef('');
    const activeSessionId = useRef(null); // sessionId in use for saving
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, botKey]);

    // ── History mode: load a past conversation ────────────────────────────────
    function loadHistorySession(sid) {
        const session = getSession(sid);
        if (!session) { resetFlow(); return; }

        setIsHistory(true);
        setReplies([]);
        setShowInput(false);
        setStep(3);

        // Map stored messages → display format
        const msgs = (session.messages || []).map((m, i) => {
            // Check if content is doctor-card JSON
            let text = m.content || '';
            let cards = null;
            let html = null;
            try {
                const parsed = JSON.parse(m.content);
                if (parsed && parsed.__doctorCards) {
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
        // Save to session if active
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
        flowState.current = { selectedState: '', selectedHospital: '', condition: '' };
        pendingStep.current = '';
        activeSessionId.current = null;
        setMessages([]);
        setReplies([]);
        setShowInput(false);
        setInputVal('');
        setStep(1);
        setIsHistory(false);

        // Create a new session in localStorage so it appears in History sidebar
        try {
            const session = await createSession(botKey);
            activeSessionId.current = session.id;
            // Notify parent to refresh History list
            if (onSessionCreated) {
                const sessions = await listSessions(botKey);
                onSessionCreated(sessions);
            }
        } catch (err) {
            console.warn('Could not create session for doctor chat:', err.message);
        }

        addBotMsg(`Hello! I'm the Ulink ${isSG ? 'SG' : 'MY'} Doctor Recommendation Assistant. I'll help you find the right specialist.`);
        askState();
    }

    function askState() {
        setStep(1);
        if (isSG) {
            flowState.current.selectedState = 'Singapore';
            askHospitalYesNo();
        } else {
            addBotMsg('Which state does the patient need a doctor in?');
            showQuickReplies(STATES.map(s => ({ label: s.label, value: s.value })));
        }
    }

    function handleStateChoice(val) {
        flowState.current.selectedState = val;
        if (val === 'Unsure' || !HOSPITALS[val]) {
            askCondition();
        } else {
            askHospitalYesNo();
        }
    }

    function askHospitalYesNo() {
        addBotMsg('Do you have a hospital in mind?');
        showQuickReplies([
            { label: '1. Yes', value: 'yes' },
            { label: '2. No / Unsure', value: 'no' },
        ]);
        pendingStep.current = 'hospital-yn';
    }

    function handleHospitalYN(val) {
        if (val === 'yes') {
            const stateName = flowState.current.selectedState;
            const opts = (HOSPITALS[stateName] || []).map(h => ({ label: h, value: h }));
            addBotMsg(`Please select a hospital in ${stateName}:`,
                { html: `Please select a hospital in <strong>${escHtml(stateName)}</strong>:` });
            showQuickReplies(opts);
            pendingStep.current = 'hospital-pick';
        } else {
            flowState.current.selectedHospital = '';
            askCondition();
        }
    }

    function handleHospitalPick(val) {
        if (val === 'Not Listed') {
            addBotMsg("Which hospital do you have in mind? I'll search for available doctors.");
            showTextInput('Type hospital name…');
            pendingStep.current = 'hospital-text';
        } else {
            flowState.current.selectedHospital = val;
            askCondition();
        }
    }

    function askCondition() {
        addBotMsg("What is the patient's medical condition or required procedure?");
        showTextInput('e.g. heart attack, knee replacement, breast cancer…');
        pendingStep.current = 'condition';
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    function handleSend() {
        const val = inputVal.trim();
        if (!val) return;
        addUserMsg(val);
        setInputVal('');
        hide();

        if (pendingStep.current === 'hospital-text') {
            flowState.current.selectedHospital = val;
            askCondition();
        } else if (pendingStep.current === 'condition') {
            flowState.current.condition = val;
            fetchRecommendation(val);
        }
        pendingStep.current = '';
    }

    function handleQuickReply(opt) {
        addUserMsg(opt.label || opt.value);
        hide();
        const ps = pendingStep.current;
        pendingStep.current = '';

        if (!ps) handleStateChoice(opt.value);
        else if (ps === 'hospital-yn') handleHospitalYN(opt.value);
        else if (ps === 'hospital-pick') handleHospitalPick(opt.value);
        else if (ps === 'done-choice') {
            if (opt.value === 'restart') resetFlow();
            else askCondition();
        }
    }

    // ── Webhook call ──────────────────────────────────────────────────────────
    async function fetchRecommendation(condition) {
        setStep(3);
        setLoading(true);
        const typingId = Date.now();
        setMessages(prev => [...prev, { type: 'typing', id: typingId }]);

        const webhookUrl = getWebhookUrl(botKey);
        const payload = {
            condition,
            hospital: flowState.current.selectedHospital || '',
            state: flowState.current.selectedState === 'Unsure' ? '' : (flowState.current.selectedState || ''),
            country,
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
            displayRecommendations(data, condition);
        } catch (err) {
            setMessages(prev => prev.filter(m => m.id !== typingId));
            addBotMsg(`⚠️ Sorry, I couldn't connect to the recommendation service.\nError: ${err.message}`);
            showQuickReplies([{ label: '🔄 Start New Search', value: 'restart' }]);
            pendingStep.current = 'done-choice';
        } finally {
            setLoading(false);
        }
    }

    function displayRecommendations(data, condition) {
        const recs = data.recommendations || [];

        if (!data || data.outcome === 'not_found' || recs.length === 0) {
            addBotMsg(`I can't find doctor recommendations for "${condition}" with those filters.\n\nWould you like to try a different search?`);
            showQuickReplies([
                { label: '🔄 New Recommendation', value: 'restart' },
                { label: '🔍 Try Another Condition', value: 'condition' },
            ]);
            pendingStep.current = 'done-choice';
            return;
        }

        if (data.ai_specialty) {
            addBotMsg(`✅ Identified specialty: ${data.ai_specialty} (${data.ai_type})`);
        }

        // Save card data as JSON so it survives in history
        const cardJson = JSON.stringify({ ...data, __doctorCards: true });
        if (activeSessionId.current) {
            appendMessage(activeSessionId.current, 'assistant', cardJson);
        }

        setMessages(prev => [...prev, {
            role: 'bot', text: '', cards: data, id: Date.now(),
        }]);

        if (recs.length === 1) {
            addBotMsg('I only found 1 doctor recommendation. Would you like to look for more?');
            showQuickReplies([
                { label: '🔍 Try Another Condition', value: 'condition' },
                { label: '🔄 Start Over', value: 'restart' },
            ]);
        } else {
            addBotMsg('Here are your doctor recommendations! ⚠️ Please verify each link before sharing with the member.');
            showQuickReplies([{ label: '🔄 New Recommendation', value: 'restart' }]);
        }
        pendingStep.current = 'done-choice';

        // Refresh history sidebar after saving
        if (onSessionCreated) {
            listSessions(botKey).then(sessions => onSessionCreated(sessions)).catch(() => { });
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────
    const stepLabel = { 1: 'Step 1 — Location', 2: 'Step 2 — Condition', 3: 'Step 3 — Results' };

    return (
        <div className="dc-widget">
            {/* Step progress */}
            <div className="dc-steps">
                {[1, 2, 3].map(n => (
                    <div key={n} className={`dc-dot ${n < step ? 'done' : n === step ? 'active' : ''}`} />
                ))}
                <span className="dc-step-label">
                    {isHistory ? '📋 History View' : stepLabel[step]}
                </span>
                {isHistory && (
                    <button
                        className="dc-qr-btn"
                        style={{ marginLeft: 'auto', fontSize: 11 }}
                        onClick={() => { activeSessionId.current = null; resetFlow(); }}
                    >
                        🔄 New Search
                    </button>
                )}
            </div>

            {/* Messages */}
            <div className="dc-messages">
                {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
                <div ref={endRef} />
            </div>

            {/* Input area — hidden in history mode */}
            {!isHistory && (
                <div className="dc-input-area">
                    {quickReplies.length > 0 && (
                        <div className="dc-quick-replies">
                            {quickReplies.map(opt => (
                                <button
                                    key={opt.value}
                                    className="dc-qr-btn"
                                    onClick={() => handleQuickReply(opt)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {showInput && (
                        <div className="dc-text-row">
                            <input
                                ref={inputRef}
                                className="dc-text-input"
                                value={inputVal}
                                placeholder={inputPlaceholder}
                                onChange={e => setInputVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
                                disabled={loading}
                            />
                            <button
                                className="dc-send-btn"
                                onClick={handleSend}
                                disabled={!inputVal.trim() || loading}
                            >
                                <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z" /></svg>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
