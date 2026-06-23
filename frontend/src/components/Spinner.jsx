export default function Spinner({ size = 24 }) {
  return (
    <div style={{
      width: size, height: size, border: '3px solid #e5e7eb',
      borderTopColor: '#10b981', borderRadius: '50%',
      animation: 'spin 0.6s linear infinite', display: 'inline-block',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
