import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  UserCredential,
  sendPasswordResetEmail,
  signOut
} from '@angular/fire/auth';

import {
  Firestore,
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc
} from '@angular/fire/firestore';

export interface Credential {
  email: string;
  password: string;
}

export interface Usuario {
  uid: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: string;
  creadoEn?: any;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);

  readonly authState$ = authState(this.auth);
  currentUserRole: string | null = null;

  // 🔐 Registro
  signUpWithEmailAndPassword(credential: Credential): Promise<UserCredential> {
    return createUserWithEmailAndPassword(
      this.auth,
      credential.email,
      credential.password
    );
  }

  // 🔐 Login con carga de rol
  async logIn(email: string, password: string): Promise<UserCredential> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    const uid = userCredential.user.uid;
  
    const docRef = doc(this.firestore, `usuarios/${uid}`);
    const snap = await getDoc(docRef);
  
    if (snap.exists()) {
      const data = snap.data();
      this.currentUserRole = data['rol'];
  
      if (this.currentUserRole) {
        localStorage.setItem('userRole', this.currentUserRole); // ✅ corregido
      }
    }
  
    return userCredential;
  }
  
  


  // 🔓 Logout
  async logOut(): Promise<void> {
    this.currentUserRole = null;
    localStorage.removeItem('userRole'); // ✅ borrar al salir
    await signOut(this.auth);
  }
  

  // 🔍 Obtener el rol actual
  getUserRole(): string | null {
    if (this.currentUserRole) return this.currentUserRole;
  
    const storedRole = localStorage.getItem('userRole');
    if (storedRole) {
      this.currentUserRole = storedRole;
      return storedRole;
    }
  
    return null;
  }
  async obtenerDatosUsuarioActual(): Promise<Usuario | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
  
    const docRef = doc(this.firestore, `usuarios/${user.uid}`);
    const snap = await getDoc(docRef);
  
    if (snap.exists()) {
      return snap.data() as Usuario;
    }
  
    return null;
  }  
  

  // 📧 Recuperar contraseña
  enviarCorreoRecuperacion(email: string): Promise<void> {
    this.auth.languageCode = 'es-419';
    return sendPasswordResetEmail(this.auth, email);
  }

  // 📥 Guardar usuario en Firestore
  async guardarUsuarioEnFirestore(uid: string, usuario: Usuario): Promise<void> {
    const userRef = doc(this.firestore, 'usuarios', uid);
    await setDoc(userRef, usuario);
  }

  // 🔍 Verificar si el correo ya existe
  async correoExiste(email: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('email', '==', email));
    const resultado = await getDocs(q);
    return !resultado.empty;
  }

  // 🔍 Verificar si la cédula ya existe
  async existeCedula(cedula: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  }

  // ✅ (Opcional) Obtener el UID actual
  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }
  async cargarRolActual(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
  
    const docRef = doc(this.firestore, `usuarios/${user.uid}`);
    const snap = await getDoc(docRef);
  
    if (snap.exists()) {
      const data = snap.data();
      this.currentUserRole = data['rol'];
      return this.currentUserRole;
    }
  
    return null;
  }
  async obtenerCorreoPorCedula(cedula: string): Promise<string | null> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const snapshot = await getDocs(q);
  
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      return data['email'] || null;
    }
  
    return null;
  }
  
}
