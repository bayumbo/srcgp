import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule
} from '@angular/forms';

import { AuthService, Usuario, Unidad } from 'src/app/core/auth/services/auth.service'; // Importamos Unidad también
import { Router } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { doc, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
@Component({
  standalone: true,
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: '../register/register.component.scss',
  imports: [CommonModule, ReactiveFormsModule]
})
export class RegisterComponent {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private _router = inject(Router);
  private functions = inject(Functions);
  @ViewChild('cedulaInput') cedulaInput!: ElementRef;

  hidePassword: boolean = true;
  mensajeExito: string = '';
  mensajeError: string = '';
  isRegistering: boolean = false;
  form: FormGroup = this.fb.group({
    cedula: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    nombres: ['', Validators.required],
    apellidos: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rol: ['usuario', Validators.required],
    unidadInput: ['', Validators.required], // Campo para la entrada de texto de las unidades
    empresa: ['General Pintag', Validators.required]
  });
  volverAlMenu: any;

async signUp(): Promise<void> {
  if (this.isRegistering) return; // Evita llamadas dobles
  this.isRegistering = true;

  if (this.form.invalid) {
    this.form.markAllAsTouched();
    alert('Por favor completa todos los campos correctamente.');
    this.isRegistering = false;
    return;
  }

  const { cedula, nombres, apellidos, email, password, rol, unidadInput, empresa } = this.form.value;

  try {
    // Verificar cédula
    const cedulaExiste = await this.authService.existeCedula(cedula);
    if (cedulaExiste) {
      alert('Ya existe un usuario registrado con esta cédula.');
      return;
    }

    // 1️⃣ Registrar en Firebase Auth
    const userCredential = await this.authService.signUpWithEmailAndPassword({ email, password });
    const uid = userCredential.user.uid;
    console.log('✅ Usuario registrado en Auth:', uid);

    // 2️⃣ Guardar usuario en Firestore
    const usuarioData: Omit<Usuario, 'uid'> = {
      cedula,
      nombres,
      apellidos,
      email,
      rol,
      empresa,
      estado: true,
      creadoEn: new Date()
    };
    await this.authService.guardarUsuarioEnFirestore(uid, usuarioData);
    console.log('📝 Documento de usuario guardado en Firestore.');

    // 🔄 Guardar unidades (subcolección)
    const unidadesArray = unidadInput.split(',')
      .map((u: string) => u.trim())
      .filter((u: string) => u !== '');

    for (const unidadNombre of unidadesArray) {
      const unidad: Unidad = { nombre: unidadNombre };
      await this.authService.guardarUnidadEnSubcoleccion(uid, unidad);
      console.log(`🚍 Unidad "${unidadNombre}" guardada en subcolección`);
    }

    // 3️⃣ Llamar función para asignar rol y esperar propagation
    try {
      const asignarFn = httpsCallable(this.functions, 'asignarRolDesdeFirestore');
      await asignarFn({ uid });
      console.log('⏳ Esperando a que el claim de rol se propague...');

      // Función interna para esperar a que el claim esté disponible
      async function waitForClaim(user: User, claimKey: string, retries = 5, delay = 1000) {
        for (let i = 0; i < retries; i++) {
          const tokenResult = await user.getIdTokenResult();
          if (tokenResult.claims[claimKey]) return tokenResult.claims[claimKey];
          await new Promise(res => setTimeout(res, delay));
        }
        return null;
      }

      const claimRol = await waitForClaim(userCredential.user, 'role', 5, 1000);
      console.log('🔐 Rol en claim después del registro:', claimRol);

      const rolString = typeof claimRol === 'string' ? claimRol : '';
      this.authService['_currentUserRole'].next(rolString || null);
      localStorage.setItem('userRole', rolString);
 
    } catch (error) {
      console.warn('⚠️ No se pudo asignar el claim de rol automáticamente.', error);
    }

    // 4️⃣ Mensaje de éxito
    this.mensajeExito = '✅ Registro exitoso';
    setTimeout(() => (this.mensajeExito = ''), 3000);

    // 5️⃣ Limpiar formulario y reenfocar
    this.form.reset();
    this.hidePassword = true;
    setTimeout(() => this.cedulaInput?.nativeElement?.focus(), 0);

  } catch (error: any) {
    console.error('❌ Error en el registro:', error);
    this.mensajeError = error.code === 'auth/email-already-in-use'
      ? 'Ya existe un usuario registrado con este correo electrónico.'
      : 'Ocurrió un error al registrar. Intenta nuevamente.';
    setTimeout(() => (this.mensajeError = ''), 3000);
  }
  finally {
    this.isRegistering = false; // siempre liberar el flag
  }
}

}