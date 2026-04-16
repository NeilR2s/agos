import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDY87xeAb2MeGGQdb8fOWT3ruHzU0m7ndk",
    authDomain: "agos-auth.firebaseapp.com",
    projectId: "agos-auth",
    storageBucket: "agos-auth.firebasestorage.app",
    messagingSenderId: "492650165211",
    appId: "1:492650165211:web:d4fc29afc3a54906d8edfe",
    measurementId: "G-JJTN2BFRJ0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
