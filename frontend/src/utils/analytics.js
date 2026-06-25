import { doc, setDoc, collection, addDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function trackEvent(eventName, data = {}, uid) {
  const domain = window.location.hostname;
  try {
    await addDoc(collection(db, 'analytics_events'), {
      event: eventName,
      domain,
      uid: uid || 'anonymous',
      timestamp: serverTimestamp(),
      ...data,
    });

    const dailyRef = doc(db, 'analytics_daily', todayKey());
    const updates = {
      date: todayKey(),
      [`domains.${domain.replace(/\./g, '_')}`]: increment(1),
    };

    if (eventName === 'page_view') updates.pageViews = increment(1);
    if (eventName === 'recipe_generate') updates.recipeGenerates = increment(1);
    if (eventName === 'scan_complete') updates.scans = increment(1);
    if (eventName === 'user_signup') updates.signups = increment(1);

    await setDoc(dailyRef, updates, { merge: true });
  } catch (err) {
    console.warn('[Analytics] trackEvent failed:', err.message);
  }
}
