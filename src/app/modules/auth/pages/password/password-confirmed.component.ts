import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-password-confirmed',
  imports: [CommonModule],
  templateUrl: './password-confirmed.component.html'
})
export class PasswordConfirmedComponent {
  constructor(private router: Router) {}

  irAlLogin() {
    this.router.navigate(['/auth/login']);
  }
}
