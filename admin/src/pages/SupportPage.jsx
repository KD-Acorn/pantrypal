import { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
  collection, query, orderBy, limit, onSnapshot,
  doc, updateDoc, serverTimestamp, getDoc, setDoc,
} from 'firebase/firestore';

const STATUS_COLORS = {
  active: '#3b82f6',
  'in-progress': '#f59e0b',
  resolved: '#10b981',
  'manual-report': '#8b5cf6',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#9ca3af';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: `${color}18`, color, border: `1px solid ${color}40`,
    }}>{status || 'active'}</span>
  );
}

function ModelBadge({ model }) {
  if (!model) return null;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 10, fontSize: 10,
      background: model === 'sonnet' ? '#fef3c7' : '#f3f4f6',
      color: model === 'sonnet' ? '#92400e' : '#6b7280',
      border: `1px solid ${model === 'sonnet' ? '#fde68a' : '#e5e7eb'}`,
    }}>{model === 'sonnet' ? '⚡ Sonnet' : '🤖 Haiku'}</span>
  );
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function SessionRow({ session, isSelected, onClick }) {
  const lastMsg = session.messages?.filter(m => !m.isWelcome)?.slice(-1)?.[0];
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px', borderBottom: '1px solid #f0f0f0',
        background: isSelected ? '#f0fdf4' : '#fff',
        cursor: 'pointer', transition: 'background 0.1s',
        borderLeft: isSelected ? '3px solid #10b981' : '3px solid transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {session.displayName || 'Anonymous'}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          <ModelBadge model={session.model} />
          <StatusBadge status={session.status} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {lastMsg?.content?.slice(0, 80) || 'No messages yet'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{session.context?.currentTab || 'unknown'}</div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{fmtTime(session.lastMessageAt)}</div>
      </div>
    </div>
  );
}

function Transcript({ session, onMarkResolved, onAddNote }) {
  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [saving, setSaving] = useState(false);

  async function markResolved() {
    setSaving(true);
    try { await updateDoc(doc(db, 'support_sessions', session.id), { status: 'resolved', resolvedAt: serverTimestamp() }); }
    catch { /* non-fatal */ } finally { setSaving(false); }
    onMarkResolved?.();
  }

  async function submitNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const noteObj = { text: note.trim(), addedAt: new Date().toISOString(), addedBy: 'admin' };
      const existing = session.adminNotes || [];
      await updateDoc(doc(db, 'support_sessions', session.id), { adminNotes: [...existing, noteObj] });
      setNote(''); setAddingNote(false);
    } catch { /* non-fatal */ } finally { setSaving(false); }
  }

  const msgs = (session.messages || []).filter(m => !m.isWelcome);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Detail header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{session.displayName || 'Anonymous'}</div>
          <ModelBadge model={session.model} />
          <StatusBadge status={session.status} />
          {session.rating && <span style={{ fontSize: 12, color: '#f59e0b' }}>{'⭐'.repeat(session.rating)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#6b7280', flexWrap: 'wrap' }}>
          <span>UID: {session.uid?.slice(-8) || '—'}</span>
          <span>Tab: {session.context?.currentTab || '—'}</span>
          <span>Items: {session.context?.pantryItemCount ?? '—'}</span>
          <span>Device: {session.context?.deviceInfo?.os} / {session.context?.deviceInfo?.browser}</span>
          <span>Started: {fmtTime(session.startedAt)}</span>
          {session.escalated && <span style={{ color: '#f59e0b' }}>⚡ Escalated</span>}
          {session.bugReportId && <span style={{ color: '#10b981' }}>Bug filed: #{session.bugReportId.slice(-8)}</span>}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 32 }}>No messages in this session</div>}
        {msgs.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 2 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', padding: '0 4px' }}>
              {msg.role === 'user' ? (session.displayName || 'User') : 'Pantry AI'}
              {msg.timestamp && ` · ${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </div>
            <div style={{
              maxWidth: '80%', padding: '8px 12px',
              borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
              background: msg.role === 'user' ? '#10b981' : '#f3f4f6',
              color: msg.role === 'user' ? '#fff' : '#374151',
              fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Admin notes */}
        {session.adminNotes?.length > 0 && (
          <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 12, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>ADMIN NOTES</div>
            {session.adminNotes.map((n, i) => (
              <div key={i} style={{
                background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                padding: '8px 10px', fontSize: 12, color: '#92400e', marginBottom: 6,
              }}>
                <div>{n.text}</div>
                <div style={{ fontSize: 10, color: '#b45309', marginTop: 4 }}>{n.addedBy} · {n.addedAt ? new Date(n.addedAt).toLocaleString() : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions footer */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {addingNote ? (
          <div>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Admin note..."
              style={{
                width: '100%', minHeight: 60, border: '1px solid #e5e7eb', borderRadius: 8,
                padding: 8, fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                boxSizing: 'border-box', outline: 'none', marginBottom: 6,
              }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { setAddingNote(false); setNote(''); }} style={{
                flex: 1, height: 32, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff',
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151',
              }}>Cancel</button>
              <button onClick={submitNote} disabled={!note.trim() || saving} style={{
                flex: 1, height: 32, borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600,
                background: note.trim() && !saving ? '#f59e0b' : '#d1d5db', color: '#fff',
                cursor: note.trim() && !saving ? 'pointer' : 'default', fontFamily: 'inherit',
              }}>Add Note</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAddingNote(true)} style={{
              flex: 1, height: 34, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff',
              fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151',
            }}>📋 Add Note</button>
            {session.status !== 'resolved' && (
              <button onClick={markResolved} disabled={saving} style={{
                flex: 1, height: 34, borderRadius: 8, border: 'none', background: saving ? '#d1d5db' : '#10b981',
                color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>✅ Mark Resolved</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SupportPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(db, 'support_sessions'), orderBy('lastMessageAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, snap => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const filtered = statusFilter === 'all'
    ? sessions
    : sessions.filter(s => (s.status || 'active') === statusFilter);

  const selected = filtered.find(s => s.id === selectedId) || null;

  const counts = {
    active: sessions.filter(s => !s.status || s.status === 'active').length,
    'in-progress': sessions.filter(s => s.status === 'in-progress').length,
    resolved: sessions.filter(s => s.status === 'resolved').length,
    'manual-report': sessions.filter(s => s.status === 'manual-report').length,
    escalated: sessions.filter(s => s.escalated).length,
  };

  return (
    <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 10 }}>💬 Support Sessions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: `All (${sessions.length})` },
            { key: 'active', label: `Active (${counts.active})` },
            { key: 'in-progress', label: `In Progress (${counts['in-progress']})` },
            { key: 'manual-report', label: `Manual (${counts['manual-report']})` },
            { key: 'resolved', label: `Resolved (${counts.resolved})` },
          ].map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              border: statusFilter === f.key ? 'none' : '1px solid #e5e7eb',
              background: statusFilter === f.key ? '#10b981' : '#fff',
              color: statusFilter === f.key ? '#fff' : '#6b7280',
              fontWeight: statusFilter === f.key ? 600 : 400,
            }}>{f.label}</button>
          ))}
          {counts.escalated > 0 && (
            <span style={{
              padding: '4px 10px', borderRadius: 16, fontSize: 12,
              background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a',
            }}>⚡ {counts.escalated} escalated</span>
          )}
        </div>
      </div>

      {/* Body: list + transcript */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Session list */}
        <div style={{
          width: selected ? 280 : '100%', flexShrink: 0,
          borderRight: selected ? '1px solid #f0f0f0' : 'none',
          overflowY: 'auto',
        }}>
          {loading && <div style={{ padding: 24, color: '#9ca3af', fontSize: 14 }}>Loading sessions...</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              No support sessions yet
            </div>
          )}
          {filtered.map(s => (
            <SessionRow
              key={s.id}
              session={s}
              isSelected={s.id === selectedId}
              onClick={() => setSelectedId(prev => prev === s.id ? null : s.id)}
            />
          ))}
        </div>

        {/* Transcript panel */}
        {selected && (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Transcript
              session={selected}
              onMarkResolved={() => {}}
              onAddNote={() => {}}
            />
          </div>
        )}
      </div>
    </div>
  );
}
