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
  getDoc,
  addDoc
} from '@angular/fire/firestore';

import { BehaviorSubject } from 'rxjs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth as getAuthStandalone, User } from 'firebase/auth';
import { environment } from 'src/environments/environment';

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
  rol: 'usuario' | 'admin' | 'socio' | 'recaudador';
  empresa: string;
  estado: boolean;
  creadoEn: Date;
}

export interface Unidad {
  nombre: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);

  readonly authState$ = authState(this.auth);

  private _currentUserRole = new BehaviorSubject<string | null>(null);
  public readonly currentUserRole$ = this._currentUserRole.asObservable();

  constructor() {
    // Escuchar cambios en el estado de autenticación
    this.authState$.subscribe(user => {
      if (user) {
        this.cargarRolActual().then(rol => {
          this._currentUserRole.next(rol);
        });
      } else {
        this._currentUserRole.next(null);
        localStorage.removeItem('userRole');
      }
    });
  }

  getUser(): Promise<User | null> {
    return new Promise(resolve => {
      const unsubscribe = this.auth.onAuthStateChanged(user => {
        resolve(user);
        unsubscribe();
      });
    });
  }

  async signUpWithEmailAndPassword(credential: Credential): Promise<UserCredential> {
    const secondaryApp = initializeApp(environment.firebase, 'SecondaryApp');
    const secondaryAuth = getAuthStandalone(secondaryApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        credential.email,
        credential.password
      );
      return userCredential;
    } finally {
      await secondaryAuth.signOut();
      await deleteApp(secondaryApp);
    }
  }

  async logIn(email: string, password: string): Promise<UserCredential> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    const user = userCredential.user;

    // Forzar recarga del token
    await user.getIdToken(true);
    const token = await user.getIdTokenResult();
    const role = token.claims['role'] as string | null;
    this._currentUserRole.next(role);
    localStorage.setItem('userRole', role ?? '');

    // Leer datos públicos
    const uid = user.uid;
    const docRef = doc(this.firestore, `usuariosPublicos/${uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      const rol = data['rol'];
      if (rol) {
        this._currentUserRole.next(rol);
        localStorage.setItem('userRole', rol);
      }
    }

    return userCredential;
  }

  async logOut(): Promise<void> {
    this._currentUserRole.next(null);
    localStorage.removeItem('userRole');
    await signOut(this.auth);
  }

  getUserRole(): string | null {
    return this._currentUserRole.getValue() || localStorage.getItem('userRole');
  }

  async obtenerDatosUsuarioActual(): Promise<Usuario | null> {
    const user = this.auth.currentUser;
    if (!user) return null;

    const docRef = doc(this.firestore, `usuariosPublicos/${user.uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return snap.data() as Usuario;
    }

    return null;
  }

  enviarCorreoRecuperacion(email: string): Promise<void> {
    this.auth.languageCode = 'es-419';
    return sendPasswordResetEmail(this.auth, email);
  }

  async guardarUsuarioEnFirestore(uid: string, usuario: Omit<Usuario, 'uid'>): Promise<void> {
    // Guardar en la colección privada
    const userRef = doc(this.firestore, 'usuarios', uid);
    await setDoc(userRef, usuario);

    // Guardar en la colección pública
    const userPublicoRef = doc(this.firestore, 'usuariosPublicos', uid);
    await setDoc(userPublicoRef, {
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      cedula: usuario.cedula,
      email: usuario.email
    });
  }

  async guardarUnidadEnSubcoleccion(userId: string, unidad: Unidad): Promise<void> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    await addDoc(unidadesRef, unidad);
  }

  async obtenerUnidadesDeUsuario(userId: string): Promise<Unidad[]> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    const q = query(unidadesRef);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Unidad);
  }

  async correoExiste(email: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuariosPublicos');
    const q = query(usuariosRef, where('email', '==', email));
    const resultado = await getDocs(q);
    return !resultado.empty;
  }

  async existeCedula(cedula: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuariosPublicos');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  }

  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  getCurrentUser() {
    return this.auth.currentUser;
  }

  async cargarRolActual(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) {
      this._currentUserRole.next(null);
      return null;
    }

    const docRef = doc(this.firestore, `usuarios/${user.uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const rol = snap.data()['rol'];
      this._currentUserRole.next(rol);
      return rol;
    }

    this._currentUserRole.next(null);
    return null;
  }

  async obtenerCorreoPorCedula(cedula: string): Promise<string | null> {
    const usuariosRef = collection(this.firestore, 'usuariosPublicos');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      return data['email'] || null;
    }

    return null;
  }
}
