import { useState } from 'react';
import SHOPPING_PARTNERS from '../config/shoppingPartners';

const CLICKS_KEY = 'pantrypal_affiliate_clicks';

function logAffiliateClicks(partnerId, items) {
  try {
    const all = JSON.parse(localStorage.getItem(CLICKS_KEY) || '[]');
    for (const item of items) {
      all.push({
        partnerId,
        ingredientName: item.name,
        recipeTitle: 'grocery_list',
        quantity: item.quantity,
        unit: item.unit,
        clickedAt: new Date().toISOString(),
      });
    }
    localStorage.setItem(CLICKS_KEY, JSON.stringify(all));
  } catch {}
}

function buildMultiUrl(partner, items) {
  const names = items.map(i => i.name);
  if (partner.id === 'amazon_fresh') {
    return `https://www.amazon.com/s?k=${names.join('+')}&i=amazonfresh&tag=mypantryclub-20`;
  }
  if (partner.id === 'instacart') {
    return `https://www.instacart.com/store/s?q=${names.join('%20')}`;
  }
  // Fallback: use multiSearchUrl template if present
  if (partner.multiSearchUrl) {
    return partner.multiSearchUrl.replace('{items}', encodeURIComponent(names.join(' ')));
  }
  return null;
}

function formatList(items) {
  const lines = items.map(i => `• ${i.quantity} ${i.unit} ${i.name}`).join('\n');
  return `My Pantry Club — Grocery List\n\n${lines}`;
}

export default function ShopListSheet({ checkedItems, onClose }) {
  const [sessionItems, setSessionItems] = useState(checkedItems);
  const [copied, setCopied] = useState(false);

  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  function removeItem(id) {
    setSessionItems(prev => prev.filter(i => i.id !== id));
  }

  function handlePartner(partner) {
    if (sessionItems.length === 0) return;
    const url = buildMultiUrl(partner, sessionItems);
    if (url) {
      logAffiliateClicks(partner.id, sessionItems);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  function handleCopy() {
    if (sessionItems.length === 0) return;
    const text = formatList(sessionItems);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  async function handleShare() {
    if (!canShare || sessionItems.length === 0) return;
    try {
      await navigator.share({ title: 'Grocery List', text: formatList(sessionItems) });
    } catch {}
  }

  const partnerOptions = [
    ...SHOPPING_PARTNERS.map(p => ({
      id: p.id,
      icon: p.icon,
      label: p.name,
      desc: `Search all items on ${p.name}`,
      onClick: () => handlePartner(p),
    })),
    {
      id: 'copy',
      icon: '📋',
      label: copied ? '✓ Copied!' : 'Copy List',
      desc: 'Copy to clipboard — paste into any grocery app',
      onClick: handleCopy,
    },
    ...(canShare ? [{
      id: 'share',
      icon: '🗣',
      label: 'Share List',
      desc: 'Share via Messages, WhatsApp, etc.',
      onClick: handleShare,
    }] : []),
  ];

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      animation: 'shopOverlayIn 0.2s ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
        animation: 'shopSlideUp 0.3s ease-out',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Shop Your List</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                {sessionItems.length} item{sessionItems.length !== 1 ? 's' : ''} selected
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: '0 2px' }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Items preview */}
          {sessionItems.length > 0 ? (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Items</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sessionItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                    <span style={{ flex: 1, fontSize: 14, color: '#374151' }}>
                      {item.name}
                      <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 6 }}>{item.quantity} {item.unit}</span>
                    </span>
                    <button onClick={() => removeItem(item.id)} style={{
                      background: 'none', border: 'none', fontSize: 16, color: '#d1d5db',
                      cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0,
                    }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              No items selected. Close and check some items first.
            </div>
          )}

          {/* Shopping options */}
          <div style={{ padding: '12px 16px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Shop With</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {partnerOptions.map(opt => (
                <button key={opt.id} onClick={opt.onClick} disabled={sessionItems.length === 0 && opt.id !== 'copy' && opt.id !== 'share'} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff',
                  cursor: (sessionItems.length === 0 && opt.id !== 'copy' && opt.id !== 'share') ? 'default' : 'pointer',
                  textAlign: 'left', fontFamily: 'inherit',
                  opacity: (sessionItems.length === 0 && opt.id !== 'copy' && opt.id !== 'share') ? 0.5 : 1,
                }}>
                  <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>{opt.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: opt.id === 'copy' && copied ? '#10b981' : '#111827' }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{opt.desc}</div>
                  </div>
                  {(opt.id !== 'copy' && opt.id !== 'share') && (
                    <span style={{ fontSize: 16, color: '#d1d5db' }}>↗</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px 28px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginBottom: 10 }}>
            After shopping, check items off to move them to your pantry
          </div>
          <button onClick={onClose} style={{
            width: '100%', height: 44, borderRadius: 10, border: 'none',
            background: '#10b981', color: '#fff', fontSize: 15, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Done</button>
        </div>
      </div>

      <style>{`
        @keyframes shopSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes shopOverlayIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
