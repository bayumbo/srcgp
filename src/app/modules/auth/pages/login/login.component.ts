import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from 'src/app/core/auth/services/auth.service';
import { httpsCallable } from 'firebase/functions';
import { Functions } from '@angular/fire/functions';

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  imports: [CommonModule, ReactiveFormsModule]
})
export class LoginComponent {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private functions = inject(Functions);

  form: FormGroup = this.fb.group({
    cedula: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    password: ['', [Validators.required]]
  });

  hidePassword: boolean = true;
  isLoading: boolean = false;

  async logIn(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      alert('Por favor completa todos los campos correctamente.');
      return;
    }

    this.isLoading = true;

    const cedula = this.form.value.cedula;
    const password = this.form.value.password;

    try {
      const email = await this.authService.obtenerCorreoPorCedula(cedula);

      if (!email) {
        alert('No se encontró un usuario con esa cédula.');
        return;
      }

      // Login y carga de rol en paralelo
      await this.authService.logIn(email, password);
      const user = await this.authService.getCurrentUser();
      if (!user) {
        console.warn('⚠️ No hay usuario autenticado.');
        return;
      }

        if (user) {
        const tokenResult = await user.getIdTokenResult(true); // ← Fuerza la recarga del token
        console.log('✅ Claims actualizados:', tokenResult.claims);
      }
      const rol = await this.authService.cargarRolActual();

      // Redirección según rol
      if (rol === 'usuario') {
        this.router.navigate(['/perfil']);
      } else {
        this.router.navigate(['/']);
      }

    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      alert('Cédula o contraseña incorrectos');
    } finally {
      this.isLoading = false;
    }
  }

  goToResetPassword(): void {
    this.router.navigate(['/auth/reset-password']);
  }
}
