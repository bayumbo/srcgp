import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService, Credential } from 'src/app/core/auth/services/auth.service';

@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.component.html',
  imports: [CommonModule, ReactiveFormsModule]
})
export class LoginComponent {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  form: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  hidePassword: boolean = true;

  async logIn(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      alert('Por favor completa todos los campos correctamente.');
      return;
    }

    const credential: Credential = {
      email: this.form.value.email,
      password: this.form.value.password
    };

    try {
      await this.authService.loginWithEmailAndPassword(credential);
      this.router.navigate(['/auth/menu']);
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      alert('Correo o contraseña incorrectos');
    }
  }
  goToResetPassword(): void {
    this.router.navigate(['/auth/reset-password']);
  }
  
 
}
