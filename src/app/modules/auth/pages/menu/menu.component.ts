import { Component, inject, OnInit } from '@angular/core';
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
export class MenuComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  rol: string | null = null;
  isLoading = true; // 👈 bandera de carga

  async ngOnInit(): Promise<void> {
    this.rol = this.authService.getUserRole();

    if (!this.rol) {
      this.rol = await this.authService.cargarRolActual();
    }

    this.isLoading = false; // 👈 solo después de cargar el rol
  }

  async logOut(): Promise<void> {
    await this.authService.logOut();
    this.router.navigate(['/auth/login']);
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }

  goTo(route: string): void {
    this.router.navigate([route]);
  }
}


