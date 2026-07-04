import { collection, doc, getDoc, getDocs, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { initCorrectionCache, updateCorrectionCacheEntry } from './usePantry';

// Populate the module-level correction cache in usePantry from Firestore.
// Call once on PantryPage mount — non-critical, silently swallowed on error.
export async function loadCategoryCorrections() {
  try {
    const snap = await getDocs(collection(db, 'category_corrections'));
    const corrections = snap.docs.map(d => ({ normalizedName: d.id, ...d.data() }));
    initCorrectionCache(corrections);
  } catch {
    // Non-critical — keyword matching still works as fallback
  }
}

// Write a user correction to Firestore and update the in-memory cache immediately.
// Increments votes[newCategory] by 2 so a single correction meets the >= 2 threshold.
export async function recordCategoryCorrection(uid, itemName, newCategory) {
  if (!uid || !itemName || !newCategory) return;
  const normalizedName = itemName.trim().toLowerCase();
  const ref = doc(db, 'category_corrections', normalizedName);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        [`votes.${newCategory}`]: increment(2),
        totalCorrections: increment(1),
        displayName: itemName,
        lastCorrectedAt: serverTimestamp(),
        lastCorrectedBy: uid,
      });
    } else {
      await setDoc(ref, {
        normalizedName,
        displayName: itemName,
        votes: { [newCategory]: 2 },
        totalCorrections: 1,
        lastCorrectedAt: serverTimestamp(),
        lastCorrectedBy: uid,
      });
    }
    // Apply immediately without waiting for next cache refresh
    updateCorrectionCacheEntry(normalizedName, newCategory);
  } catch {
    // Best-effort — category is still updated in Firestore pantry doc
  }
}
