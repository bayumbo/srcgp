import { initializeApp } from '@angular/fire/app';
import { getFirestore } from '@angular/fire/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { environment } from 'src/environments/environment';

const firebaseApp = initializeApp(environment.firebase);

export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp);