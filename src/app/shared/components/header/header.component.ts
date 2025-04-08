import { Component, inject, OnInit, ChangeDetectorRef, ViewChild, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from 'src/app/core/auth/services/auth.service';
import { Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-header',
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  @ViewChild('menuRef') menuRef!: ElementRef;
@ViewChild('avatarRef') avatarRef!: ElementRef;

@HostListener('document:click', ['$event'])
onClickOutside(event: MouseEvent): void {
  const clickedInsideMenu = this.menuRef?.nativeElement.contains(event.target);
  const clickedAvatar = this.avatarRef?.nativeElement.contains(event.target);

  if (!clickedInsideMenu && !clickedAvatar) {
    this.isMenuOpen = false;
  }
}

  nombreCompleto: string = '';
  rol: string = '';
  isMenuOpen: boolean = false;
  

  async ngOnInit(): Promise<void> {
    const usuario = await this.authService.obtenerDatosUsuarioActual();
    console.log('👤 Usuario cargado en header:', usuario);

    if (usuario) {
      this.nombreCompleto = `${usuario.nombres} ${usuario.apellidos}`;
      this.rol = usuario.rol;
      this.cdr.detectChanges();
    } else {
      console.warn('⚠ No se encontró un usuario logueado o no tiene datos.');
    }
  }

  getIniciales(): string {
    return this.nombreCompleto
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  irPerfil(): void {
    this.router.navigate(['/perfil']);
    this.isMenuOpen = false;
  }

  async logOut(): Promise<void> {
    await this.authService.logOut();
    this.router.navigate(['/auth/login']);
  }
}
