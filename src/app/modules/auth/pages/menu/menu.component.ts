import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.css'],
  imports: [CommonModule]
})
export class MenuComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  async logOut(): Promise<void> {
    try {
      await this.authService.logOut();
      this.router.navigate(['/auth/login']);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }

  goTo(route: string): void {
    this.router.navigate([route]);
  }
}
