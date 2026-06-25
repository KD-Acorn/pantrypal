import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays } from 'date-fns';
import { db } from '../firebase';

const RANGES = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
];

const DOMAIN_LABELS = {
  mypantryclub_com: 'mypantryclub.com',
  mypantryclub_app: 'mypantryclub.app',
  pantry_doneitmobile_com: 'pantry.doneitmobile.com',
  localhost: 'localhost',
};

export default function AnalyticsPage() {
  const [range, setRange] = useState('30');
  const [dailyData, setDailyData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [range]);

  async function loadData() {
    setLoading(true);
    try {
      const days = parseInt(range, 10);
      const dateKeys = [];
      for (let i = days - 1; i >= 0; i--) {
        dateKeys.push(format(subDays(new Date(), i), 'yyyy-MM-dd'));
      }
      const docs = await Promise.all(dateKeys.map(d => getDoc(doc(db, 'analytics_daily', d))));
      setDailyData(dateKeys.map((d, i) => {
        const data = docs[i].exists() ? docs[i].data() : {};
        return {
          date: format(new Date(d + 'T12:00:00'), days <= 7 ? 'EEE' : 'MMM d'),
          dateKey: d,
          pageViews: data.pageViews || 0,
          recipeGenerates: data.recipeGenerates || 0,
          scans: data.scans || 0,
          signups: data.signups || 0,
          domains: data.domains || {},
        };
      }));
    } catch (err) {
      console.error('[Analytics] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const domainTable = useMemo(() => {
    const totals = {};
    dailyData.forEach(d => {
      Object.entries(d.domains).forEach(([k, v]) => {
        totals[k] = (totals[k] || 0) + (v || 0);
      });
    });
    return Object.entries(totals)
      .map(([key, total]) => ({ domain: DOMAIN_LABELS[key] || key.replace(/_/g, '.'), total }))
      .sort((a, b) => b.total - a.total);
  }, [dailyData]);

  const pill = (key, label) => (
    <button onClick={() => setRange(key)} style={{
      fontSize: 12, fontWeight: range === key ? 600 : 400, padding: '6px 14px',
      borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
      border: range === key ? 'none' : '1px solid #e5e7eb',
      background: range === key ? '#22c55e' : '#fff',
      color: range === key ? '#fff' : '#6b7280',
    }}>{label}</button>
  );

  const chartInterval = range === '7' ? 0 : range === '30' ? 4 : 10;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Analytics</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Detailed usage metrics</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {RANGES.map(r => pill(r.key, r.label))}
      </div>

      {/* Signups chart */}
      <div style={{
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
        padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Signups</div>
        {dailyData.some(d => d.signups > 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={chartInterval} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="signups" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
            {loading ? 'Loading...' : 'No signup data yet'}
          </div>
        )}
      </div>

      {/* Scans by type — since we track all as scan_complete, show total scans */}
      <div style={{
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
        padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Scans vs Recipes</div>
        {dailyData.some(d => d.scans > 0 || d.recipeGenerates > 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={chartInterval} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="scans" fill="#22c55e" name="Scans" radius={[2, 2, 0, 0]} />
              <Bar dataKey="recipeGenerates" fill="#3b82f6" name="Recipes" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
            {loading ? 'Loading...' : 'No scan data yet'}
          </div>
        )}
      </div>

      {/* Domain breakdown */}
      <div style={{
        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
        padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 16 }}>Traffic by Domain</div>
        {domainTable.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Domain</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Events</th>
              </tr>
            </thead>
            <tbody>
              {domainTable.map(d => (
                <tr key={d.domain} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '8px 12px', color: '#374151' }}>{d.domain}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#111827' }}>{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            {loading ? 'Loading...' : 'No domain data yet'}
          </div>
        )}
      </div>
    </div>
  );
}
