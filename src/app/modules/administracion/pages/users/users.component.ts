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
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/core/auth/services/auth.service';

@Component({
  standalone: true,
  selector: 'app-perfil',
  imports: [CommonModule, FormsModule],
  templateUrl: './user.component.html',
  styleUrls: ['./user.component.scss']
})
export class PerfilComponent implements OnInit {
  nombres: string = '';
  apellidos: string = '';
  correo: string = '';
  nuevaContrasena: string = '';
  contrasenaActual: string = '';
  unidad: string = '';
  cedula: string = '';
  empresa: string='';

  uid: string | undefined;
  showCurrentPassword: boolean = false;
  showNewPassword: boolean = false;
  esAdmin: boolean = false;
  soloLectura: boolean = false;

  constructor(
    private router: Router,
    private authService: AuthService,
    private route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    const uidParam = this.route.snapshot.paramMap.get('uid');
    const auth = getAuth();
  
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        this.correo = user.email || '';
  
        if (uidParam) {
          this.uid = uidParam;
  
          // ✅ Comparar UID actual con el UID del perfil que se va a ver
          if (uidParam !== user.uid) {
            this.soloLectura = true;
          }
        } else {
          this.uid = user.uid;
        }
  
        await this.cargarDatosUsuario();
  
        const rol = await this.authService.cargarRolActual();
        this.esAdmin = rol === 'admin';
      }
  
      unsubscribe(); // detiene el listener
    });
  }
  async cargarDatosUsuario() {
    try {
      const firestore = getFirestore();
      if (!this.uid) return;

      const docRef = doc(firestore, 'usuarios', this.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        this.nombres = data['nombres'] || '';
        this.apellidos = data['apellidos'] || '';
        this.cedula = data['cedula'] || '';
        this.unidad = data['unidad'] || '';
        this.empresa = data['empresa'] || '';
        this.correo = data['email'] || this.correo;
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
      const email = user.email;
      if (!email) return alert('❌ Email no disponible');

      if (this.correo !== email) {
        await updateEmail(user, this.correo);
      }

      if (this.nuevaContrasena) {
        if (this.nuevaContrasena.length < 6) {
          return alert('⚠️ La nueva contraseña debe tener al menos 6 caracteres');
        }
        if (!this.contrasenaActual) {
          return alert('⚠️ Ingresa tu contraseña actual');
        }

        const credential = EmailAuthProvider.credential(email, this.contrasenaActual);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, this.nuevaContrasena);
      }

      alert('✅ Cambios guardados correctamente');
      this.cancelarCambioContrasena();

    } catch (error: any) {
      const errorCode = error?.code || error?.error?.code;
      if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        alert('❌ Contraseña incorrecta');
      } else {
        alert('❌ Error: ' + (error.message || 'Ocurrió un error inesperado'));
      }
    }
  }

  cancelarCambioContrasena(): void {
    this.nuevaContrasena = '';
    this.contrasenaActual = '';
    this.showNewPassword = false;
    this.showCurrentPassword = false;
  }

  togglePasswordVisibility(type: 'current' | 'new'): void {
    if (type === 'current') {
      this.showCurrentPassword = !this.showCurrentPassword;
    } else {
      this.showNewPassword = !this.showNewPassword;
    }
  }

  volverAlMenu(): void {
    this.router.navigate(['/menu']);
  }
}
