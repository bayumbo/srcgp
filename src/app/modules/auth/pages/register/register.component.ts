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
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    alert('Por favor completa todos los campos correctamente.');
    return;
  }

  const {
    cedula, nombres, apellidos, email, password, rol, unidadInput, empresa
  } = this.form.value;

  try {
    const cedulaExiste = await this.authService.existeCedula(cedula);
    if (cedulaExiste) {
      alert('Ya existe un usuario registrado con esta cédula.');
      return;
    }

    // 1️⃣ Registrar en Firebase Auth
    const userCredential = await this.authService.signUpWithEmailAndPassword({ email, password });
    const uid = userCredential.user.uid;
    console.log('✅ Usuario registrado en Auth:', uid);

    // 2️⃣ Guardar usuario en Firestore (sin uid porque lo pasamos por separado)
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

    // 3️⃣ Llamar función para asignar rol
    try {
      const asignarFn = httpsCallable(this.functions, 'asignarRolDesdeFirestore');
      await asignarFn({ uid });

      console.log('⏳ Esperando 2 segundos para que el claim esté disponible...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const user = userCredential.user;

      await user.getIdToken(true); // 🔄 Fuerza refresh del token
      const refreshedResult = await user.getIdTokenResult(); // ✅ Token ya actualizado

      const claimRol = refreshedResult.claims['role'] || null;
      console.log('🔐 Rol en claim después del registro:', claimRol);

      this.authService['_currentUserRole'].next(typeof claimRol === 'string' ? claimRol : null);
      localStorage.setItem('userRole', typeof claimRol === 'string' ? claimRol : '');
    } catch (error) {
      console.warn('⚠️ No se pudo asignar el claim de rol automáticamente.', error);
    }

    // 4️⃣ Guardar unidades (subcolección)
    const unidadesArray = unidadInput.split(',').map((u: string) => u.trim()).filter((u: string) => u !== '');
    for (const unidadNombre of unidadesArray) {
      const unidad: Unidad = { nombre: unidadNombre };
      await this.authService.guardarUnidadEnSubcoleccion(uid, unidad);
      console.log(`🚍 Unidad "${unidadNombre}" guardada en subcolección`);
    }

    // 5️⃣ Mostrar mensaje de éxito
    this.mensajeExito = '✅ Registro exitoso';
    setTimeout(() => (this.mensajeExito = ''), 3000);

    // 6️⃣ Limpiar formulario y reenfocar
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
}

}