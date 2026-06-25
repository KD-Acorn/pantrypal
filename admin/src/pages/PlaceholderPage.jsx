export default function PlaceholderPage({ title, icon, description }) {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{title}</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>{description}</p>
      <div style={{
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
        padding: 40, textAlign: 'center', color: '#9ca3af',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
        <div style={{ fontSize: 14 }}>This section is under construction.</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Check back soon.</div>
      </div>
    </div>
  );
}
