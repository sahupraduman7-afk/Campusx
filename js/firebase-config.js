/**
 * CAMPUSX — FIREBASE CONFIGURATION & INITIALIZATION
 * =============================================================================
 * INSTRUCTIONS FOR DEVELOPER:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Create a new Firebase Project (e.g. "campusx-college-portal").
 * 3. Enable Authentication (Email/Password sign-in provider).
 * 4. Create Cloud Firestore database in production or test mode.
 * 5. Enable Firebase Storage for document/file uploads.
 * 6. Register a Web App (</>) and copy the `firebaseConfig` credentials below.
 * 7. Replace the placeholder values with your real project credentials.
 * =============================================================================
 */

const firebaseConfig = {
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional

  apiKey: "AIzaSyAYXZbk0nxUsuXM7p_eURHaAYpdnKIh7Bc",
  authDomain: "campusx-c094d.firebaseapp.com",
  projectId: "campusx-c094d",
  storageBucket: "campusx-c094d.firebasestorage.app",
  messagingSenderId: "180180253007",
  appId: "1:180180253007:web:bfb210db7c7ce78e52ad3a",
  measurementId: "G-PH65GZ3N96"

};

// Initialize Real Firebase Services
let app, auth, db, storage;

try {
  app = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  console.log("🚀 [CampusX] Connected to live Firebase Cloud Services.");
} catch (error) {
  console.error("❌ [CampusX] Firebase initialization failed. Ensure your firebase-config.js has valid credentials and Firebase SDKs are loaded.", error);
}

// Expose services globally for use across all portal pages
window.auth = auth;
window.db = db;
window.storage = storage;
