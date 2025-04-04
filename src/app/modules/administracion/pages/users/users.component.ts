import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  getAuth,
  updatePassword,
  updateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} from '@angular/fire/auth';
import { doc, getDoc, getFirestore } from '@angular/fire/firestore';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule],
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.css']
})
export class PerfilComponent implements OnInit {
  nombres: string = '';
  apellidos: string = '';
  correo: string = '';
  nuevaContrasena: string = '';
  contrasenaActual: string = '';
  cargando = true;
  uid: string | undefined;
  cancelarCambioContrasena(): void {
    this.nuevaContrasena = '';
    this.contrasenaActual = '';
    this.showNewPassword = false;
    this.showCurrentPassword = false;
  }
  

  showCurrentPassword: boolean = false;
  showNewPassword: boolean = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    const auth = getAuth();
    const user = auth.currentUser;

    if (user) {
      this.uid = user.uid;
      this.correo = user.email || '';
      this.cargarDatosUsuario();
    }

    this.cargando = false;
  }

  async cargarDatosUsuario() {
    try {
      const firestore = getFirestore();

      if (!this.uid) {
        console.error('UID no está definido');
        return;
      }

      const docRef = doc(firestore, 'usuarios', this.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        this.nombres = data['nombres'] || '';
        this.apellidos = data['apellidos'] || '';
      } else {
        console.warn('El documento del usuario no existe en Firestore');
      }
    } catch (error) {
      console.error('Error al cargar usuario:', error);
    }
  }

  get passwordStrength(): string {
    const pass = this.nuevaContrasena;
    if (!pass) return '';
    if (pass.length < 6) return 'Débil';
    if (/[A-Z]/.test(pass) && /[0-9]/.test(pass) && /[!@#$%^&*]/.test(pass)) return 'Fuerte';
    return 'Media';
  }

  async guardarCambios() {
    const auth = getAuth();
    const user = auth.currentUser;
  
    if (!user) return;
  
    try {
      // Validar email
      const email = user.email;
      if (!email) {
        alert('❌ No se puede verificar el usuario: email no disponible');
        return;
      }
  
      // Cambio de correo
      if (this.correo !== email) {
        await updateEmail(user, this.correo);
      }
  
      // Cambio de contraseña
      if (this.nuevaContrasena) {
        if (this.nuevaContrasena.length < 6) {
          alert('⚠️ La nueva contraseña debe tener al menos 6 caracteres');
          return;
        }
  
        if (!this.contrasenaActual) {
          alert('⚠️ Debes ingresar tu contraseña actual para cambiarla');
          return;
        }
  
        // Crear credencial segura
        const credential = EmailAuthProvider.credential(email, this.contrasenaActual);
  
        // Reautenticación
        await reauthenticateWithCredential(user, credential);
  
        // Si reautenticó, cambiamos contraseña
        await updatePassword(user, this.nuevaContrasena);
      }
  
      alert('✅ Cambios guardados correctamente');
      this.cancelarCambioContrasena(); // Limpia los campos
  
    } catch (error: any) {
      console.error('🔥 Error de autenticación:', error);
      const errorCode = error?.code || error?.error?.code;
  
      if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        alert('❌ Contraseña incorrecta');
      } else {
        alert('❌ Error: ' + (error.message || 'Ocurrió un error inesperado'));
      }
    }
  }
  togglePasswordVisibility(type: 'current' | 'new'): void {
    if (type === 'current') {
      this.showCurrentPassword = !this.showCurrentPassword;
    } else {
      this.showNewPassword = !this.showNewPassword;
    }
  }
  

  volverAlMenu() {
    this.router.navigate(['/menu']);
  }
}
