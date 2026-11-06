import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB3XEMwKnqgBAPhB0H5YrmevBmc7lcBtEA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sismalert-prod.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sismalert-prod",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sismalert-prod.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "247905346194",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:247905346194:web:bcde0dc04dec2074c7fc4b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export default app;
