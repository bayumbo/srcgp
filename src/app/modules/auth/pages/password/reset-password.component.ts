import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-reset-password',
  imports: [CommonModule, FormsModule, MatSnackBarModule],
  template: `
    <div class="container">
      <h2>Restablecer contraseña</h2>
      <form (ngSubmit)="enviarEnlace()">
        <label for="email">Correo electrónico</label>
        <input
          type="email"
          id="email"
          name="email"
          [(ngModel)]="email"
          placeholder="tucorreo@ejemplo.com"
          required
        />
        <button type="submit">Enviar enlace</button>
      </form>

      <button class="volver-btn" type="button" (click)="volverAlLogin()">← Volver al login</button>
    </div>
  `,
  styles: [`
    .volver-btn {
      margin-top: 1rem;
      background-color: transparent;
      color: #1976d2;
      border: none;
      cursor: pointer;
      text-decoration: underline;
    }
    .volver-btn:hover {
      text-decoration: none;
    }
  `]
})
export class ResetPasswordComponent {
  email: string = '';

  constructor(
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  enviarEnlace() {
    if (!this.email) {
      this.snackBar.open('Por favor, ingresa un correo electrónico.', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    this.authService.correoExiste(this.email).then(existe => {
      if (!existe) {
        this.snackBar.open('❌ Este correo no está registrado.', 'Cerrar', {
          duration: 4000,
          panelClass: ['snack-error']
        });
        return;
      }

      // Si el correo existe, enviamos el enlace de recuperación
      this.authService.enviarCorreoRecuperacion(this.email)
        .then(() => {
          this.snackBar.open('📩 Se envió el enlace para restablecer tu contraseña.', 'Cerrar', {
            duration: 3000,
            panelClass: ['snack-success']
          });
          setTimeout(() => {
            this.router.navigate(['/auth/login']);
          }, 3000);
        })
        .catch(error => {
          this.snackBar.open('❌ Error: ' + error.message, 'Cerrar', {
            duration: 4000,
            panelClass: ['snack-error']
          });
        });
    });
  }

  volverAlLogin() {
    this.router.navigate(['/auth/login']);
  }
}
