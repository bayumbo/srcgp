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
  busquedaActiva: boolean = false;
  cedulaBuscada: string = '';
  todosLosUsuarios: Usuario[] = []; // respaldo general

  constructor(
    public usuariosService: UsuariosService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.usuariosService.usuarios$.subscribe(lista => {
      const listaConEstado = lista.map(usuario => ({
        ...usuario,
        estado: usuario.estado ?? true
      }));

      this.todosLosUsuarios = listaConEstado; // respaldo
      this.filtrarUsuarios(listaConEstado);
      this.cargando = false;
    });

    this.usuariosService.cargarPrimerosUsuarios();
  }

  filtrarUsuarios(lista: Usuario[]): void {
    this.usuariosFiltrados = this.mostrarSoloActivos
      ? lista.filter(u => u.estado)
      : lista;
  }

  async cambiarEstado(uid: string, estado: boolean): Promise<void> {
    await this.usuariosService.actualizarEstado(uid, estado);

    const actualizados = this.todosLosUsuarios.map(usuario =>
      usuario.uid === uid ? { ...usuario, estado } : usuario
    );

    this.todosLosUsuarios = actualizados;
    this.filtrarUsuarios(actualizados);
  }

  async guardarNuevoRol(uid: string, nuevoRol: string): Promise<void> {
    await this.usuariosService.actualizarRol(uid, nuevoRol);

    const actualizados = this.todosLosUsuarios.map(usuario => {
      if (usuario.uid === uid) {
        return { ...usuario, rol: nuevoRol, nuevoRol };
      }
      return usuario;
    });

    this.todosLosUsuarios = actualizados;
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
    this.buscarPorCedula(); // actualizar búsqueda según estado
  }

  verPerfil(uid: string): void {
    this.router.navigate(['/perfil', uid]);
  }

  volverAlMenu(): void {
    this.router.navigate(['/menu']);
  }

  buscarPorCedula(): void {
    const termino = this.cedulaBuscada.trim().toLowerCase();
    this.busquedaActiva = termino.length > 0;

    if (!termino) {
      this.filtrarUsuarios(this.todosLosUsuarios);
      return;
    }

    const coincidencias = this.todosLosUsuarios.filter(usuario =>
      usuario.cedula.toLowerCase().includes(termino) ||
      `${usuario.nombres} ${usuario.apellidos}`.toLowerCase().includes(termino)
    );

    // Si no hay coincidencias, mostrar la lista completa
    if (coincidencias.length === 0) {
      this.filtrarUsuarios(this.todosLosUsuarios);
    } else {
      this.filtrarUsuarios(coincidencias);
    }
  }
}
