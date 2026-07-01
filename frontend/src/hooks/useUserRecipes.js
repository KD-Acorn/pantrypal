import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot,
  query, where, orderBy, getDocs, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from '../firebase';

export default function useUserRecipes(uid) {
  const [recipes, setRecipes] = useState([]);
  const recipesRef = useRef(recipes);
  recipesRef.current = recipes;

  useEffect(() => {
    if (!uid) { setRecipes([]); return; }
    const q = query(
      collection(db, 'user_recipes'),
      where('authorUid', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('useUserRecipes:', err));
    return unsub;
  }, [uid]);

  const createRecipe = useCallback(async (recipeData, authorName) => {
    if (!uid) return null;
    const id = `ur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const data = {
      ...recipeData,
      id,
      authorUid: uid,
      authorName: authorName || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      madeCount: 0,
      savedCount: 0,
      avgRating: 0,
      ratingCount: 0,
      isOriginal: true,
    };
    await setDoc(doc(db, 'user_recipes', id), data);
    if (recipeData.visibility === 'community') {
      await setDoc(doc(db, 'public_recipes', id), {
        ...data,
        isUserSubmitted: true,
        originalRecipeId: id,
        sharedAt: serverTimestamp(),
        rating: 0,
        ratingCount: 0,
        saveCount: 0,
      });
    }
    return id;
  }, [uid]);

  const updateRecipe = useCallback(async (id, changes) => {
    if (!uid) return;
    const recipe = recipesRef.current.find(r => r.id === id);
    const wasComm = recipe?.visibility === 'community';
    const nowComm = changes.visibility === 'community';
    const becameNonComm = wasComm && changes.visibility && !nowComm;

    await updateDoc(doc(db, 'user_recipes', id), { ...changes, updatedAt: serverTimestamp() });

    if (nowComm) {
      const merged = { ...recipe, ...changes };
      await setDoc(doc(db, 'public_recipes', id), {
        ...merged,
        isUserSubmitted: true,
        originalRecipeId: id,
        sharedAt: serverTimestamp(),
        rating: merged.avgRating || 0,
        ratingCount: merged.ratingCount || 0,
        saveCount: merged.savedCount || 0,
      }, { merge: true });
    } else if (becameNonComm) {
      await deleteDoc(doc(db, 'public_recipes', id)).catch(() => {});
    } else if (wasComm) {
      const safeChanges = Object.fromEntries(
        Object.entries(changes).filter(([k]) => !['visibility', 'authorUid'].includes(k))
      );
      await updateDoc(doc(db, 'public_recipes', id), { ...safeChanges, updatedAt: serverTimestamp() }).catch(() => {});
    }
  }, [uid]);

  const deleteRecipe = useCallback(async (id) => {
    if (!uid) return;
    const recipe = recipesRef.current.find(r => r.id === id);
    await deleteDoc(doc(db, 'user_recipes', id));
    if (recipe?.visibility === 'community') {
      await deleteDoc(doc(db, 'public_recipes', id)).catch(() => {});
    }
  }, [uid]);

  const toggleVisibility = useCallback((id, newVisibility) => {
    return updateRecipe(id, { visibility: newVisibility });
  }, [updateRecipe]);

  const logMadeIt = useCallback(async (id) => {
    if (!uid) return;
    await updateDoc(doc(db, 'user_recipes', id), { madeCount: increment(1) });
  }, [uid]);

  const incrementSavedCount = useCallback(async (id) => {
    if (!id) return;
    await updateDoc(doc(db, 'user_recipes', id), { savedCount: increment(1) }).catch(() => {});
  }, []);

  const getComments = useCallback(async (recipeId) => {
    const snap = await getDocs(collection(db, 'recipe_comments', recipeId, 'comments'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));
  }, []);

  const addComment = useCallback(async (recipeId, text, authorName) => {
    if (!uid) return null;
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const data = {
      id, authorUid: uid, authorName: authorName || '',
      text, createdAt: serverTimestamp(), likes: 0, likedBy: [],
    };
    await setDoc(doc(db, 'recipe_comments', recipeId, 'comments', id), data);
    return { ...data, createdAt: { toDate: () => new Date() } };
  }, [uid]);

  const deleteComment = useCallback(async (recipeId, commentId) => {
    if (!uid) return;
    await deleteDoc(doc(db, 'recipe_comments', recipeId, 'comments', commentId));
  }, [uid]);

  const likeComment = useCallback(async (recipeId, commentId, currentLikedBy = []) => {
    if (!uid) return { alreadyLiked: false, newLikedBy: currentLikedBy };
    const alreadyLiked = currentLikedBy.includes(uid);
    const newLikedBy = alreadyLiked
      ? currentLikedBy.filter(u => u !== uid)
      : [...currentLikedBy, uid];
    await updateDoc(doc(db, 'recipe_comments', recipeId, 'comments', commentId), {
      likes: increment(alreadyLiked ? -1 : 1),
      likedBy: newLikedBy,
    });
    return { alreadyLiked, newLikedBy };
  }, [uid]);

  return {
    recipes,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    toggleVisibility,
    logMadeIt,
    incrementSavedCount,
    getComments,
    addComment,
    deleteComment,
    likeComment,
  };
}
