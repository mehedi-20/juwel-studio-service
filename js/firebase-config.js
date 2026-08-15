// Firebase Configuration for Juwel Telecom E-Sheba Portal
// --------------------------------------------------------------------------
// Real credentials successfully configured!
// --------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyBJ6MQdKDQwuXHivIs9PxMdOQ1PHz_gfqQ",
  authDomain: "juwel-e-sheba-portal.firebaseapp.com",
  projectId: "juwel-e-sheba-portal",
  storageBucket: "juwel-e-sheba-portal.firebasestorage.app",
  messagingSenderId: "972174365334",
  appId: "1:972174365334:web:f880a53eb151c81113a8b7"
};

// Determine if Firebase is configured with real credentials
const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";
};
