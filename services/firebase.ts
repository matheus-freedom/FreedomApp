import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Aqui o seu app puxa as chaves secretas que guardamos no Netlify
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Iniciando o "Prédio" do Firebase
const app = initializeApp(firebaseConfig);

// Abrindo as portas da Autenticação (Porteiro) e do Banco de Dados (Arquivos)
export const auth = getAuth(app);
export const db = getFirestore(app);
