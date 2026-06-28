export default function LegalPage({ mode, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 210, background: '#fff', overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '14px 16px',
          borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: '#374151', padding: '0 8px 0 0', lineHeight: 1,
          }}>←</button>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>
            {mode === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
          </span>
        </div>

        <div style={{ padding: '20px 16px 100px', fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
          {mode === 'privacy' ? <PrivacyContent /> : <TermsContent />}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginTop: 28, marginBottom: 8 }}>{children}</h2>;
}

function PrivacyContent() {
  return (
    <>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Effective: June 28, 2026 · Last updated: June 28, 2026</div>

      <SectionTitle>1. Introduction</SectionTitle>
      <p>My Pantry Club ("we", "us", "our") is operated by DoneIt Technologies. This policy explains how we collect, use, and protect your information.</p>

      <SectionTitle>2. Information We Collect</SectionTitle>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Account info:</strong> email address, display name (via Firebase Auth)</li>
        <li><strong>Pantry data:</strong> ingredient names, quantities, expiry dates you enter</li>
        <li><strong>Scan data:</strong> photos sent for ingredient recognition (not stored — sent directly to OpenAI and immediately discarded)</li>
        <li><strong>Usage data:</strong> which features you use, recipe generates, scan counts</li>
        <li><strong>Device info:</strong> browser type, OS (collected only when you submit a bug report)</li>
        <li><strong>Household data:</strong> shared pantry and recipes with household members you invite</li>
      </ul>

      <SectionTitle>3. How We Use Your Information</SectionTitle>
      <ul style={{ paddingLeft: 20 }}>
        <li>To provide recipe suggestions via Anthropic Claude API</li>
        <li>To identify ingredients via OpenAI GPT-4o (images not stored)</li>
        <li>To sync your pantry across devices via Firebase Firestore</li>
        <li>To show you community recipes from other users</li>
        <li>To improve the app through anonymous usage analytics</li>
        <li>We never sell your personal information to third parties</li>
      </ul>

      <SectionTitle>4. Third-Party Services</SectionTitle>
      <p>We use these services to operate My Pantry Club:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Firebase (Google)</strong> — authentication and data storage</li>
        <li><strong>Anthropic Claude</strong> — recipe generation AI</li>
        <li><strong>OpenAI GPT-4o</strong> — ingredient image recognition</li>
        <li><strong>Spoonacular</strong> — recipe database</li>
        <li><strong>Cloudflare</strong> — content delivery and security</li>
      </ul>

      <SectionTitle>5. Affiliate Links</SectionTitle>
      <p>My Pantry Club participates in affiliate programs including Amazon Associates and Instacart. When you click ingredient links, we may earn a small commission at no cost to you. We only recommend services we believe are useful.</p>

      <SectionTitle>6. Data Retention</SectionTitle>
      <ul style={{ paddingLeft: 20 }}>
        <li>Your data is retained as long as your account is active</li>
        <li>You can delete your account at any time from Settings</li>
        <li>Upon deletion request, your personal data is removed within 7 days</li>
        <li>Community recipes you shared are anonymized, not deleted</li>
        <li>We may retain anonymized, aggregated analytics data indefinitely</li>
      </ul>

      <SectionTitle>7. Your Rights</SectionTitle>
      <p>You have the right to:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li>Access your data (available in the app)</li>
        <li>Correct your data (editable in Settings)</li>
        <li>Delete your data (Settings → Delete Account)</li>
        <li>Export your data (coming soon)</li>
      </ul>
      <p>If you are in the EU/EEA, you have additional rights under GDPR. If you are in California, you have rights under CCPA.</p>
      <p>Contact us at: privacy@mypantryclub.com</p>

      <SectionTitle>8. Children's Privacy</SectionTitle>
      <p>My Pantry Club is not intended for children under 13. We do not knowingly collect data from children under 13.</p>

      <SectionTitle>9. Changes to This Policy</SectionTitle>
      <p>We may update this policy periodically. We will notify users of significant changes via in-app notification.</p>

      <SectionTitle>10. Contact Us</SectionTitle>
      <p>DoneIt Technologies<br />Email: privacy@mypantryclub.com<br />Website: mypantryclub.com</p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Effective: June 28, 2026</div>

      <SectionTitle>1. Acceptance of Terms</SectionTitle>
      <p>By using My Pantry Club you agree to these terms. If you do not agree, do not use the service.</p>

      <SectionTitle>2. Description of Service</SectionTitle>
      <p>My Pantry Club is a kitchen inventory and recipe discovery application. We use AI to help you manage ingredients and find recipes. The service is provided "as is" with no guarantees of availability.</p>

      <SectionTitle>3. User Accounts</SectionTitle>
      <ul style={{ paddingLeft: 20 }}>
        <li>You must be 13 or older to create an account</li>
        <li>You are responsible for maintaining your account security</li>
        <li>You must provide accurate information</li>
        <li>One account per person</li>
      </ul>

      <SectionTitle>4. Acceptable Use</SectionTitle>
      <p>You agree not to:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li>Share inappropriate, illegal, or harmful content in community recipes</li>
        <li>Attempt to access other users' private data</li>
        <li>Use the service to scrape, spam, or abuse our APIs</li>
        <li>Share content that violates intellectual property rights</li>
        <li>Use the service for any illegal purpose</li>
      </ul>

      <SectionTitle>5. User-Generated Content</SectionTitle>
      <p>When you share a recipe to the community:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li>You grant My Pantry Club a non-exclusive license to display it</li>
        <li>You confirm the recipe does not violate any copyright</li>
        <li>You understand it will be visible to all users</li>
        <li>If you delete your account, your recipes remain as "Community Member"</li>
      </ul>
      <p>We reserve the right to remove content that violates these terms.</p>

      <SectionTitle>6. Affiliate Relationships</SectionTitle>
      <p>My Pantry Club earns commissions through affiliate programs. This does not affect the price you pay. See our Privacy Policy for details.</p>

      <SectionTitle>7. AI-Generated Content</SectionTitle>
      <p>Recipes suggested by AI are generated automatically and may contain errors. Always use your judgment when preparing food. My Pantry Club is not responsible for recipe outcomes. Users with serious allergies or medical dietary needs should consult a professional, not rely solely on AI suggestions.</p>

      <SectionTitle>8. Limitation of Liability</SectionTitle>
      <p>My Pantry Club and DoneIt Technologies are not liable for:</p>
      <ul style={{ paddingLeft: 20 }}>
        <li>Inaccurate recipe suggestions</li>
        <li>Food allergic reactions from AI-suggested recipes</li>
        <li>Data loss due to technical issues</li>
        <li>Third-party service outages (Firebase, OpenAI, etc.)</li>
      </ul>
      <p>Our total liability is limited to the amount you paid us in the 12 months preceding any claim.</p>

      <SectionTitle>9. Termination</SectionTitle>
      <p>We may suspend or terminate accounts that violate these terms. You may delete your account at any time from Settings.</p>

      <SectionTitle>10. Changes to Terms</SectionTitle>
      <p>We may update these terms. Continued use after changes constitutes acceptance. We will notify users of material changes.</p>

      <SectionTitle>11. Governing Law</SectionTitle>
      <p>These terms are governed by the laws of South Carolina, USA. Disputes shall be resolved in the courts of South Carolina.</p>

      <SectionTitle>12. Contact</SectionTitle>
      <p>DoneIt Technologies<br />Email: legal@mypantryclub.com<br />Website: mypantryclub.com</p>
    </>
  );
}
