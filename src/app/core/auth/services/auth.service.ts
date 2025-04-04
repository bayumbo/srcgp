import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  UserCredential
} from '@angular/fire/auth';

import {
  Firestore,
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs
} from '@angular/fire/firestore';

export interface Credential {
  email: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);
 

  readonly authState$ = authState(this.auth);

  // 🔐 Registro
  signUpWithEmailAndPassword(Credential: Credential): Promise<UserCredential> {
    return createUserWithEmailAndPassword(
      this.auth,
      Credential.email,
      Credential.password
    );
  }

  // 🔐 Login
  loginWithEmailAndPassword(Credential: Credential) {
    return signInWithEmailAndPassword(
      this.auth,
      Credential.email,
      Credential.password
    );
  }

  // 🔐 Logout
  logOut(): Promise<void> {
    return this.auth.signOut();
  }

  // 📥 Guardar datos adicionales del usuario en Firestore
  async guardarUsuarioEnFirestore(
    uid: string,
    usuario: {
      uid: string;
      cedula: string;
      nombres: string;
      apellidos: string;
      email: string;
      rol: string;
    }
  ): Promise<void> {
      const userRef = doc(this.firestore, 'usuarios', uid);
    await setDoc(userRef, usuario);
  } 

  // 🔍 Validar si una cédula ya está registrada
  
  async existeCedula(cedula: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  }

}

