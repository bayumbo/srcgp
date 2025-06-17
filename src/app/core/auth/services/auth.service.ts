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
  // unidad: string[]; // ¡QUITAMOS ESTE CAMPO! Las unidades van en una subcolección
  estado: boolean;     // <--- AÑADE ESTO
  creadoEn: Date;      // <--- AÑADE ESTO (o Timestamp si usas el tipo de Firestore)
}

// Interfaz para la unidad dentro de la subcolección
export interface Unidad {
  nombre: string;
  // Puedes añadir más campos aquí si cada unidad necesita más atributos
}

@Injectable({ providedIn: 'root' })
export class AuthService {

  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);

  readonly authState$ = authState(this.auth);
  currentUserRole: string | null = null;

  getUser(): Promise<import('@angular/fire/auth').User | null> {
    return new Promise(resolve => {
      const unsubscribe = this.auth.onAuthStateChanged(user => {
        resolve(user);
        unsubscribe(); // evita llamadas múltiples
      });
    });
  }
  // 🔐 Registro
  async signUpWithEmailAndPassword(credential: Credential): Promise<UserCredential> {
    // Crear instancia secundaria de Firebase para evitar cerrar sesión actual
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
      // Limpieza: cerrar sesión y eliminar app secundaria
      await secondaryAuth.signOut();
      await deleteApp(secondaryApp);
    }
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

  // 📥 Guardar usuario en Firestore (documento principal del usuario)
  // Omit<Usuario, 'uid'> significa que el objeto no necesita tener la propiedad 'uid'
  // porque el 'uid' ya se pasa como un argumento separado para el path del documento.
  async guardarUsuarioEnFirestore(uid: string, usuario: Omit<Usuario, 'uid'>): Promise<void> {
    const userRef = doc(this.firestore, 'usuarios', uid);
    await setDoc(userRef, usuario);
  }


  // 📥 Guardar una unidad en la subcolección 'unidades' de un usuario
  async guardarUnidadEnSubcoleccion(userId: string, unidad: Unidad): Promise<void> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    await addDoc(unidadesRef, unidad); // addDoc genera un ID de documento automático
  }

  // 🔍 Obtener las unidades de un usuario desde la subcolección
  async obtenerUnidadesDeUsuario(userId: string): Promise<Unidad[]> {
    const unidadesRef = collection(this.firestore, `usuarios/${userId}/unidades`);
    const q = query(unidadesRef);
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Unidad);
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