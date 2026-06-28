const TABS = [
  { key: 'scan', label: 'Scan', icon: '📷' },
  { key: 'pantry', label: 'My Pantry', icon: '🧊' },
  { key: 'recipes', label: 'My Recipes', icon: '📖' },
  { key: 'grocery', label: 'Grocery', icon: '🛒' },
  { key: 'mealplan', label: 'Meal Plan', icon: '📅' },
  { key: 'discover', label: 'Discover', icon: '🍳' },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#fff', borderTop: '1px solid #f0f0f0',
      display: 'flex', justifyContent: 'space-around',
      padding: '6px 0 env(safe-area-inset-bottom, 8px)',
      zIndex: 100,
    }}>
      {TABS.map(t => {
        const sel = active === t.key;
        return (
          <button key={t.key} data-tour={`${t.key}-tab`} onClick={() => onChange(t.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, padding: '6px 0', background: 'none', border: 'none',
            cursor: 'pointer', color: sel ? '#10b981' : '#9ca3af',
            fontFamily: 'inherit', transition: 'color 0.15s',
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 9, fontWeight: sel ? 600 : 400 }}>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
