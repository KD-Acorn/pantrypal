import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays } from 'date-fns';
import { db } from '../firebase';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const DOMAIN_LABELS = {
  mypantryclub_com: 'mypantryclub.com',
  mypantryclub_app: 'mypantryclub.app',
  pantry_doneitmobile_com: 'pantry.doneitmobile.com',
  localhost: 'localhost',
};

function StatCard({ icon, label, value, loading }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
      padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
        {loading ? '...' : value}
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12,
      padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState({ users: 0, sharedRecipes: 0, activeToday: 0, bugReports: 0 });
  const [dailyData, setDailyData] = useState([]);
  const [todayDomains, setTodayDomains] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);
    try {
      const [userSnap, recipeSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'public_recipes')),
      ]);

      const today = format(new Date(), 'yyyy-MM-dd');
      const todayDoc = await getDoc(doc(db, 'analytics_daily', today));
      const todayData = todayDoc.exists() ? todayDoc.data() : {};

      const days = [];
      for (let i = 29; i >= 0; i--) {
        const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
        days.push(dateStr);
      }

      const dailyDocs = await Promise.all(
        days.map(d => getDoc(doc(db, 'analytics_daily', d)))
      );

      const dailyRows = days.map((d, i) => {
        const data = dailyDocs[i].exists() ? dailyDocs[i].data() : {};
        return {
          date: format(new Date(d + 'T12:00:00'), 'MMM d'),
          pageViews: data.pageViews || 0,
          recipeGenerates: data.recipeGenerates || 0,
          scans: data.scans || 0,
          signups: data.signups || 0,
        };
      });

      setStats({
        users: userSnap.size,
        sharedRecipes: recipeSnap.size,
        activeToday: todayData.pageViews || 0,
        bugReports: 0,
      });
      setDailyData(dailyRows);
      setTodayDomains(todayData.domains || {});
    } catch (err) {
      console.error('[Dashboard] Load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const featureData = useMemo(() => {
    const totals = { page_view: 0, recipe_generate: 0, scan_complete: 0, recipe_save: 0 };
    for (const row of dailyData) {
      totals.page_view += row.pageViews;
      totals.recipe_generate += row.recipeGenerates;
      totals.scan_complete += row.scans;
    }
    return [
      { name: 'Page Views', value: totals.page_view },
      { name: 'Recipes', value: totals.recipe_generate },
      { name: 'Scans', value: totals.scan_complete },
    ];
  }, [dailyData]);

  const domainData = useMemo(() => {
    const allDomains = {};
    for (const row of dailyData) { /* daily rollup already summed per day */ }
    for (const [key, val] of Object.entries(todayDomains)) {
      const label = DOMAIN_LABELS[key] || key.replace(/_/g, '.');
      allDomains[label] = (allDomains[label] || 0) + (val || 0);
    }
    return Object.entries(allDomains).map(([name, value]) => ({ name, value }));
  }, [todayDomains, dailyData]);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Dashboard</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>My Pantry Club admin overview</p>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="👥" label="Total Users" value={stats.users} loading={loading} />
        <StatCard icon="📊" label="Views Today" value={stats.activeToday} loading={loading} />
        <StatCard icon="🍽" label="Recipes Shared" value={stats.sharedRecipes} loading={loading} />
        <StatCard icon="🐛" label="Bug Reports" value={stats.bugReports} loading={loading} />
      </div>

      {/* DAU line chart */}
      <ChartCard title="Page Views — Last 30 Days">
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="pageViews" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
            {loading ? 'Loading...' : 'No data yet'}
          </div>
        )}
      </ChartCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Feature usage bar chart */}
        <ChartCard title="Feature Usage (30 days)">
          {featureData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={featureData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
              No data yet
            </div>
          )}
        </ChartCard>

        {/* Domain pie chart */}
        <ChartCard title="Traffic by Domain (today)">
          {domainData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={domainData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {domainData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>
              No domain data yet
            </div>
          )}
        </ChartCard>
      </div>

      {/* Domain comparison cards */}
      {Object.keys(todayDomains).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
          {Object.entries(todayDomains).map(([key, val]) => (
            <div key={key} style={{
              background: '#fff', border: '1px solid #f0f0f0', borderRadius: 10,
              padding: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                {DOMAIN_LABELS[key] || key.replace(/_/g, '.')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{val || 0}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>events today</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
