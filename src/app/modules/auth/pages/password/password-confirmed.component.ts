import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-password-confirmed',
  imports: [CommonModule],
  template: `
    <div class="container">
      <h2>✅ Se cambió la contraseña</h2>
      <p>Ahora puedes acceder con tu nueva contraseña.</p>
      <button (click)="irAlLogin()">Ir al login</button>
    </div>
  `
})
export class PasswordConfirmedComponent {
  constructor(private router: Router) {}

  irAlLogin() {
    this.router.navigate(['/auth/login']);
  }
}
