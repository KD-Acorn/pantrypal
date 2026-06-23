const COLORS = {
  success: { bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7' },
  error:   { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  info:    { bg: '#f0f9ff', color: '#0c4a6e', border: '#7dd3fc' },
};

export default function Toast({ toast }) {
  if (!toast) return null;
  const c = COLORS[toast.type] || COLORS.info;
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 500,
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)', zIndex: 9999,
      maxWidth: 'calc(100vw - 40px)', textAlign: 'center',
    }}>
      {toast.msg}
    </div>
  );
}
