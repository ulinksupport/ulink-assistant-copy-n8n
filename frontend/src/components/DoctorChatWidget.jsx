// src/components/DoctorChatWidget.jsx
// Guided multi-step doctor recommendation chat — mirrors the n8n.html flow
import React, { useEffect, useRef, useState } from 'react';
import { getWebhookUrl } from '../webhookConfig';
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

const SG_STATES = [
    { label: 'Singapore', value: 'Singapore' },
];

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

// ── Helper ───────────────────────────────────────────────────────────────────
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

// ── Message renderer ─────────────────────────────────────────────────────────
function renderDoctorCards(data) {
    const recs = data.recommendations || [];
    if (recs.length === 0) return null;

    return recs.map((r, i) => (
        <div className="doc-card" key={i}>
            <div className="rec-label">Recommendation {r.recommendation_number || i + 1}</div>
            <div className="doc-name">{r.doctor_name}</div>
            <div className="doc-hospital">{r.location}</div>
            <table>
                <tbody>
                    <tr><td>Condition</td>    <td>{r.medical_condition}</td></tr>
                    <tr><td>Specialty</td>    <td>{r.specialty}</td></tr>
                    {r.languages && <tr><td>Languages</td>  <td>{r.languages}</td></tr>}
                    {r.diagnoses && <tr><td>Diagnoses</td>  <td>{r.diagnoses}</td></tr>}
                    {r.procedures && <tr><td>Procedures</td> <td>{r.procedures}</td></tr>}
                    {r.experience && <tr><td>Experience</td> <td>{r.experience}</td></tr>}
                    <tr><td>Location</td>     <td>{r.location}</td></tr>
                    {r.website && (
                        <tr><td>Website</td>
                            <td dangerouslySetInnerHTML={{ __html: linkify(r.website) }} />
                        </tr>
                    )}
                </tbody>
            </table>
            {r.source_row && <div className="source-badge">Database Row {r.source_row}</div>}
        </div>
    ));
}

// ── Main bubble component ────────────────────────────────────────────────────
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
    return (
        <div className={`dc-msg ${isBot ? 'bot' : 'user'}`}>
            <div className="dc-avatar">{isBot ? 'U' : 'A'}</div>
            <div className="dc-bubble">
                {msg.html
                    ? <div dangerouslySetInnerHTML={{ __html: msg.html }} />
                    : <p>{msg.text}</p>}
                {msg.cards && <div className="dc-cards">{renderDoctorCards(msg.cards)}</div>}
            </div>
        </div>
    );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function DoctorChatWidget({ botKey }) {
    const isSG = botKey === 'sg-doctor';
    const country = isSG ? 'SG' : 'MY';
    const STATES = isSG ? SG_STATES : MY_STATES;
    const HOSPITALS = isSG ? SG_HOSPITALS : MY_HOSPITALS;

    const [messages, setMessages] = useState([]);
    const [quickReplies, setReplies] = useState([]);
    const [showInput, setShowInput] = useState(false);
    const [inputVal, setInputVal] = useState('');
    const [inputPlaceholder, setInputPlaceholder] = useState('Type your response…');
    const [step, setStep] = useState(1); // 1=location 2=condition 3=done
    const [loading, setLoading] = useState(false);

    const flowState = useRef({ selectedState: '', selectedHospital: '', condition: '' });
    const pendingStep = useRef('');
    const endRef = useRef(null);
    const inputRef = useRef(null);

    // auto-scroll
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, quickReplies]);

    // start flow on mount / when botKey changes
    useEffect(() => {
        resetFlow();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [botKey]);

    // ── Flow helpers ────────────────────────────────────────────────────────────
    function addBotMsg(text, extra = {}) {
        setMessages(prev => [...prev, { role: 'bot', text, ...extra, id: Date.now() + Math.random() }]);
    }

    function addUserMsg(text) {
        setMessages(prev => [...prev, { role: 'user', text, id: Date.now() + Math.random() }]);
    }

    function showQuickReplies(options) {
        setReplies(options);
        setShowInput(false);
        setInputVal('');
    }

    function showTextInput(placeholder) {
        setReplies([]);
        setShowInput(true);
        setInputPlaceholder(placeholder || 'Type your response…');
        setTimeout(() => inputRef.current?.focus(), 100);
    }

    function hide() {
        setReplies([]);
        setShowInput(false);
    }

    // ── Conversation steps ──────────────────────────────────────────────────────
    function resetFlow() {
        flowState.current = { selectedState: '', selectedHospital: '', condition: '' };
        pendingStep.current = '';
        setMessages([]);
        setReplies([]);
        setShowInput(false);
        setInputVal('');
        setStep(1);
        setTimeout(() => {
            addBotMsg(`Hello! I'm the Ulink ${isSG ? 'SG' : 'MY'} Doctor Recommendation Assistant. I'll help you find the right specialist.`);
            setTimeout(askState, 600);
        }, 300);
    }

    function askState() {
        setStep(1);
        if (isSG) {
            // SG: only one state, skip directly to hospital question
            flowState.current.selectedState = 'Singapore';
            setTimeout(askHospitalYesNo, 400);
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
            setTimeout(askHospitalYesNo, 400);
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
            addBotMsg(`Please select a hospital in <strong>${escHtml(stateName)}</strong>:`, { html: `Please select a hospital in <strong>${escHtml(stateName)}</strong>:` });
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
        setStep(2);
        setTimeout(() => {
            addBotMsg("What is the patient's medical condition or required procedure?");
            showTextInput('e.g. heart attack, knee replacement, breast cancer…');
            pendingStep.current = 'condition';
        }, 300);
    }

    // ── Send handler ─────────────────────────────────────────────────────────────
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

        if (!ps || ps === '' || ps === undefined) {
            // state selection
            handleStateChoice(opt.value);
        } else if (ps === 'hospital-yn') {
            handleHospitalYN(opt.value);
        } else if (ps === 'hospital-pick') {
            handleHospitalPick(opt.value);
        } else if (ps === 'done-choice') {
            if (opt.value === 'restart') resetFlow();
            else askCondition();
        }
    }

    // ── Webhook call ─────────────────────────────────────────────────────────────
    async function fetchRecommendation(condition) {
        setStep(3);
        setLoading(true);

        // add typing indicator
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

            // remove typing
            setMessages(prev => prev.filter(m => m.id !== typingId));

            displayRecommendations(data, condition);
        } catch (err) {
            setMessages(prev => prev.filter(m => m.id !== typingId));
            addBotMsg(`⚠️ Sorry, I couldn't connect to the recommendation service. Please try again.\nError: ${err.message}`);
            setTimeout(() => {
                showQuickReplies([{ label: '🔄 Start New Search', value: 'restart' }]);
                pendingStep.current = 'done-choice';
            }, 500);
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

        // render doctor cards
        setMessages(prev => [...prev, {
            role: 'bot',
            text: '',
            cards: data,
            id: Date.now(),
        }]);

        setTimeout(() => {
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
        }, 500);
    }

    // ── Render ───────────────────────────────────────────────────────────────────
    const stepLabel = { 1: 'Step 1 — Location', 2: 'Step 2 — Condition', 3: 'Step 3 — Results' };

    return (
        <div className="dc-widget">
            {/* Step progress */}
            <div className="dc-steps">
                {[1, 2, 3].map(n => (
                    <div key={n} className={`dc-dot ${n < step ? 'done' : n === step ? 'active' : ''}`} />
                ))}
                <span className="dc-step-label">{stepLabel[step]}</span>
            </div>

            {/* Messages */}
            <div className="dc-messages">
                {messages.map(msg => <Bubble key={msg.id} msg={msg} />)}
                <div ref={endRef} />
            </div>

            {/* Input area */}
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
        </div>
    );
}
