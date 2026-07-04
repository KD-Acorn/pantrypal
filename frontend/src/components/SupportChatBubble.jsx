import { useState, useEffect, useRef } from 'react';
import { addDoc, doc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3003';

function parseBrowser(ua) {
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Samsung')) return 'Samsung Internet';
  return 'Unknown';
}
function parseOS(ua) {
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Unknown';
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 4 }}>
      <div style={{
        background: '#f3f4f6', border: '1px solid #e5e7eb',
        borderRadius: '12px 12px 12px 2px', padding: '10px 14px',
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%', background: '#9ca3af',
            display: 'inline-block',
            animation: `supportDot 1.2s ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function renderText(content) {
  return content.split('\n').map((line, i, arr) => (
    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
  ));
}

function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

export default function SupportChatBubble({ uid, displayName, currentTab, pantryItemCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(() => `support_${uid || 'anon'}_${Date.now()}`);
  const [hasUnread, setHasUnread] = useState(false);
  const [useSonnet, setUseSonnet] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [bugReportId, setBugReportId] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualSending, setManualSending] = useState(false);
  const [sessionStatus, setSessionStatus] = useState('active');
  const [rating, setRating] = useState(0);
  const [rated, setRated] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Show welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const name = displayName?.split(' ')?.[0] || 'there';
      setMessages([{
        role: 'assistant',
        content: `Hey ${name}! 👋 I'm Pantry, your My Pantry Club assistant.\n\nI can help you with:\n• Using any feature in the app\n• Fixing something that's not working\n• Filing a bug report\n\nWhat can I help you with today?`,
        timestamp: new Date().toISOString(),
        isWelcome: true,
      }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) setHasUnread(false);
  }, [isOpen]);

  function buildContext() {
    const ua = navigator.userAgent;
    return {
      currentTab: currentTab || 'unknown',
      pantryItemCount: pantryItemCount || 0,
      uid: uid || 'anonymous',
      displayName: displayName || 'User',
      domain: window.location.hostname,
      appVersion: '1.0.0',
      recentLogs: (window.__mpcLogs || []).slice(-10),
      recentErrors: window.__mpcErrors || [],
      deviceInfo: {
        browser: parseBrowser(ua),
        os: parseOS(ua),
        deviceType: /mobile/i.test(ua) ? 'mobile' : /tablet/i.test(ua) ? 'tablet' : 'desktop',
      },
    };
  }

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || isTyping) return;
    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputText('');
    setIsTyping(true);

    try {
      const apiMessages = nextMessages
        .filter(m => !m.isWelcome)
        .map(m => ({ role: m.role, content: m.content, timestamp: m.timestamp }));

      const resp = await fetch(`${API}/api/support/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, context: buildContext(), sessionId, useSonnet }),
      });
      if (!resp.ok) throw new Error('API error');
      const data = await resp.json();

      const botMsg = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        metadata: data.metadata,
      };
      setMessages(prev => [...prev, botMsg]);

      if (data.metadata?.escalateToSonnet && !useSonnet) { setUseSonnet(true); setEscalated(true); }
      if (data.metadata?.fileBugReport && data.metadata?.bugReportId) setBugReportId(data.metadata.bugReportId);
      if (data.metadata?.suggestManualReport) {
        const userMsgs = nextMessages.filter(m => m.role === 'user').map(m => m.content).join('\n');
        setManualText(userMsgs);
        setShowManualForm(true);
      }
      if (data.metadata?.issueResolved) setSessionStatus('resolved');
      if (!isOpen) setHasUnread(true);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment. 🔌",
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }

  async function submitManualReport() {
    if (!manualText.trim() || manualSending) return;
    setManualSending(true);
    try {
      const transcript = messages.filter(m => !m.isWelcome)
        .map(m => `${m.role === 'user' ? 'User' : 'Pantry'}: ${m.content}`)
        .join('\n\n');
      await addDoc(collection(db, 'bug_reports'), {
        type: 'bug', description: manualText.trim(),
        currentTab: currentTab || 'unknown', domain: window.location.hostname,
        uid: uid || 'anonymous', status: 'in_progress',
        source: 'support_chat_manual', sessionId,
        debugInfo: { ...buildContext(), chatTranscript: transcript, capturedAt: new Date().toISOString() },
        timestamp: serverTimestamp(),
      });
      setShowManualForm(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "✅ Bug report filed! Our dev team will look into this. Thanks for helping improve My Pantry Club!",
        timestamp: new Date().toISOString(),
      }]);
    } catch { /* silent */ } finally { setManualSending(false); }
  }

  async function submitRating(stars) {
    setRating(stars);
    setRated(true);
    try { await updateDoc(doc(db, 'support_sessions', sessionId), { rating: stars }); } catch { /* non-fatal */ }
  }

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(v => !v)}
        aria-label="Open support chat"
        style={{
          position: 'fixed', bottom: 80, right: 16, zIndex: 300,
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          border: 'none', cursor: 'pointer', fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(16,185,129,0.4)',
          animation: hasUnread ? 'supportPulse 1.5s ease-in-out infinite' : 'none',
          transition: 'transform 0.15s',
        }}
      >
        {isOpen ? '✕' : '💬'}
        {hasUnread && !isOpen && (
          <span style={{
            position: 'absolute', top: 3, right: 3,
            width: 10, height: 10, borderRadius: '50%',
            background: '#ef4444', border: '2px solid #fff',
          }} />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 144, right: 16, zIndex: 299,
          width: 'min(340px, calc(100vw - 32px))',
          height: 'min(500px, calc(100dvh - 170px))',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column',
          animation: 'supportSlideUp 0.22s ease-out',
          fontFamily: 'inherit',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            borderRadius: '16px 16px 0 0', padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>🥘 Pantry — Support</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>Powered by Claude AI</div>
            </div>
            <button onClick={() => setIsOpen(false)} title="Minimize" style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>—</button>
            <button onClick={() => setIsOpen(false)} title="Close" style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>✕</button>
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Escalation notice */}
            {escalated && (
              <div style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                padding: '6px 10px', fontSize: 11, color: '#92400e', textAlign: 'center', flexShrink: 0,
              }}>
                🔍 Switching to advanced diagnostics...
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 2 }}>
                <div style={{
                  maxWidth: '84%', padding: '8px 11px',
                  borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                  background: msg.role === 'user' ? '#10b981' : '#f3f4f6',
                  border: msg.role === 'user' ? 'none' : '1px solid #e5e7eb',
                  color: msg.role === 'user' ? '#fff' : '#374151',
                  fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word',
                }}>
                  {renderText(msg.content)}
                </div>
                <div style={{ fontSize: 10, color: '#9ca3af', paddingLeft: 2, paddingRight: 2 }}>{fmtTime(msg.timestamp)}</div>

                {/* Bug report filed card */}
                {msg.metadata?.fileBugReport && bugReportId && (
                  <div style={{
                    background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
                    padding: '10px 14px', maxWidth: '92%', fontSize: 12, marginTop: 2,
                  }}>
                    <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 3 }}>✅ Bug report filed</div>
                    <div style={{ color: '#374151' }}>Report ID: #{bugReportId.slice(-8)}</div>
                    <div style={{ color: '#6b7280', marginTop: 2 }}>Status: In Progress — we'll look into this and update you.</div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && <TypingDots />}

            {/* Manual report form */}
            {showManualForm && (
              <div style={{
                background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12,
                padding: '12px', marginTop: 4, flexShrink: 0,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>📋 Submit Manual Report</div>
                <textarea
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  placeholder="Describe the issue..."
                  style={{
                    width: '100%', minHeight: 72, border: '1px solid #e5e7eb', borderRadius: 8,
                    padding: 8, fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                    boxSizing: 'border-box', outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => setShowManualForm(false)} style={{
                    flex: 1, height: 32, borderRadius: 6, border: '1px solid #e5e7eb',
                    background: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', color: '#374151',
                  }}>Continue Chatting</button>
                  <button onClick={submitManualReport} disabled={!manualText.trim() || manualSending} style={{
                    flex: 1, height: 32, borderRadius: 6, border: 'none',
                    background: manualText.trim() && !manualSending ? '#10b981' : '#d1d5db',
                    color: '#fff', fontSize: 11, fontWeight: 600,
                    cursor: manualText.trim() && !manualSending ? 'pointer' : 'default', fontFamily: 'inherit',
                  }}>{manualSending ? 'Filing...' : '📋 Submit Report'}</button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} style={{ height: 1 }} />
          </div>

          {/* Resolved banner */}
          {sessionStatus === 'resolved' && (
            <div style={{
              padding: '10px 14px', borderTop: '1px solid #f0f0f0',
              background: '#f0fdf4', flexShrink: 0,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>🎉 Glad we got that sorted!</div>
              {!rated ? (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Rate this chat:</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => submitRating(star)} style={{
                        background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: '0 1px', lineHeight: 1,
                      }}>
                        {star <= rating ? '⭐' : '☆'}
                      </button>
                    ))}
                    <button onClick={() => setIsOpen(false)} style={{
                      marginLeft: 'auto', height: 28, padding: '0 12px', borderRadius: 6,
                      border: 'none', background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>Close</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#065f46' }}>
                  Thanks for the feedback! ❤️
                  <button onClick={() => setIsOpen(false)} style={{
                    marginLeft: 'auto', background: 'none', border: 'none', color: '#10b981',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  }}>Close</button>
                </div>
              )}
            </div>
          )}

          {/* Input area */}
          {sessionStatus !== 'resolved' && (
            <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, flexShrink: 0 }}>
              <input
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value.slice(0, 500))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask me anything..."
                disabled={isTyping}
                style={{
                  flex: 1, height: 38, border: '1px solid #e5e7eb', borderRadius: 8,
                  padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  background: isTyping ? '#f9fafb' : '#fff', color: '#374151',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!inputText.trim() || isTyping}
                style={{
                  width: 38, height: 38, borderRadius: 8, border: 'none', flexShrink: 0,
                  background: inputText.trim() && !isTyping ? '#10b981' : '#d1d5db',
                  color: '#fff', fontSize: 18, cursor: inputText.trim() && !isTyping ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >→</button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes supportPulse {
          0%, 100% { box-shadow: 0 4px 16px rgba(16,185,129,0.4); }
          50% { box-shadow: 0 4px 24px rgba(16,185,129,0.8), 0 0 0 10px rgba(16,185,129,0.12); }
        }
        @keyframes supportSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes supportDot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </>
  );
}
