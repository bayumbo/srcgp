import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService, Usuario } from 'src/app/core/auth/services/usuarios.service';

@Component({
  selector: 'app-gestionroles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gestionroles.component.html',
  styleUrls: ['./gestionroles.component.scss']
})
export class GestionRolesComponent implements OnInit {
  usuariosFiltrados: Usuario[] = [];
  rolesDisponibles = ['usuario', 'admin'];
  mostrarSoloActivos = false;
  mostrarToast: boolean = false;
  cargando: boolean = true;

  constructor(
    public usuariosService: UsuariosService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.usuariosService.usuarios$.subscribe(lista => {
      this.filtrarUsuarios(lista);
      this.cargando = false;
    });

    this.usuariosService.cargarPrimerosUsuarios();
  }

  filtrarUsuarios(lista: Usuario[]): void {
    const listaConEstado = lista.map(usuario => ({
      ...usuario,
      estado: usuario.estado ?? true
    }));

    this.usuariosFiltrados = this.mostrarSoloActivos
      ? listaConEstado.filter(u => u.estado)
      : listaConEstado;
  }

  async cambiarEstado(uid: string, estado: boolean): Promise<void> {
    await this.usuariosService.actualizarEstado(uid, estado);

    const actualizados = this.usuariosService.listaUsuarios.map(usuario =>
      usuario.uid === uid ? { ...usuario, estado } : usuario
    );

    this.usuariosService.actualizarListaUsuarios(actualizados);
    this.filtrarUsuarios(actualizados);
  }

  async guardarNuevoRol(uid: string, nuevoRol: string): Promise<void> {
    await this.usuariosService.actualizarRol(uid, nuevoRol);

    const actualizados = this.usuariosService.listaUsuarios.map(usuario => {
      if (usuario.uid === uid) {
        return { ...usuario, rol: nuevoRol, nuevoRol };
      }
      return usuario;
    });

    this.usuariosService.actualizarListaUsuarios(actualizados);
    this.filtrarUsuarios(actualizados);

    this.mostrarToast = true;
    setTimeout(() => (this.mostrarToast = false), 3000);
  }

  onEstadoChange(event: Event, uid: string): void {
    const input = event.target as HTMLInputElement;
    this.cambiarEstado(uid, input.checked);
  }

  onToggleFiltro(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.mostrarSoloActivos = input.checked;
    this.filtrarUsuarios(this.usuariosService.listaUsuarios);
  }

  verPerfil(uid: string): void {
    this.router.navigate(['/perfil', uid]);
  }

  volverAlMenu(): void {
    this.router.navigate(['/menu']);
  }
}
