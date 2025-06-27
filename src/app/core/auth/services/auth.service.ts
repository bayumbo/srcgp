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

import { BehaviorSubject } from 'rxjs'; // <-- Importar BehaviorSubject

import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth as getAuthStandalone } from 'firebase/auth';
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
  empresa:string;
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

  // AÑADIDO: BehaviorSubject para el rol del usuario actual
  private _currentUserRole = new BehaviorSubject<string | null>(null);
  public readonly currentUserRole$ = this._currentUserRole.asObservable();

  constructor() {
    // Escuchar cambios en el estado de autenticación y actualizar el rol
    this.authState$.subscribe(user => {
      if (user) {
        // Si hay un usuario logueado, cargar su rol
        this.cargarRolActual().then(rol => {
          this._currentUserRole.next(rol);
        });
      } else {
        // Si no hay usuario, establecer el rol a null
        this._currentUserRole.next(null);
        localStorage.removeItem('userRole'); // Limpiar localStorage al desloguear
      }
    });
  }

  getUser(): Promise<import('@angular/fire/auth').User | null> {
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
    const uid = userCredential.user.uid;

    const docRef = doc(this.firestore, `usuarios/${uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      const rol = data['rol'];
      this._currentUserRole.next(rol); // <-- Actualiza el BehaviorSubject
      localStorage.setItem('userRole', rol);
    }

    return userCredential;
  }

  async logOut(): Promise<void> {
    this._currentUserRole.next(null); // <-- Actualiza el BehaviorSubject al cerrar sesión
    localStorage.removeItem('userRole');
    await signOut(this.auth);
  }

  // Ahora, getUserRole() puede obtener del BehaviorSubject para ser más reactivo
  // Aunque para una carga inicial, podrías seguir usando localStorage/la propiedad.
  getUserRole(): string | null {
    return this._currentUserRole.getValue(); // Obtiene el último valor emitido
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

  enviarCorreoRecuperacion(email: string): Promise<void> {
    this.auth.languageCode = 'es-419';
    return sendPasswordResetEmail(this.auth, email);
  }

  async guardarUsuarioEnFirestore(uid: string, usuario: Omit<Usuario, 'uid'>): Promise<void> {
    const userRef = doc(this.firestore, 'usuarios', uid);
    await setDoc(userRef, usuario);
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
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('email', '==', email));
    const resultado = await getDocs(q);
    return !resultado.empty;
  }

  async existeCedula(cedula: string): Promise<boolean> {
    const usuariosRef = collection(this.firestore, 'usuarios');
    const q = query(usuariosRef, where('cedula', '==', cedula));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  }

  getCurrentUserId(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  // Renombramos y adaptamos el método para cargar el rol y actualizar el BehaviorSubject
  async cargarRolActual(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) {
      this._currentUserRole.next(null); // Asegura que el Subject esté en null si no hay usuario
      return null;
    }

    const docRef = doc(this.firestore, `usuarios/${user.uid}`);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      const rol = data['rol'];
      this._currentUserRole.next(rol); // Actualiza el BehaviorSubject con el rol
      return rol;
    }

    this._currentUserRole.next(null); // Si el usuario no tiene datos de rol
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