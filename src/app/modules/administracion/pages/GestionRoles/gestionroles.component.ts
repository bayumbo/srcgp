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
  todosLosUsuarios: Usuario[] = [];
  usuariosFiltrados: Usuario[] = [];
  usuariosPaginados: Usuario[] = [];

  rolesDisponibles = ['usuario', 'admin'];
  mostrarSoloActivos = false;
  mostrarToast = false;
  cargando = true;
  busquedaActiva = false;
  cedulaBuscada = '';

  // 🔢 Paginación
  paginaActual = 1;
  itemsPorPagina = 15;
  totalPaginas = 0;

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
      this.todosLosUsuarios = listaConEstado;
      this.filtrarUsuarios(listaConEstado);
      this.cargando = false;
    });

    this.usuariosService.cargarPrimerosUsuarios();
  }

  filtrarUsuarios(lista: Usuario[]): void {
    const base = this.mostrarSoloActivos ? lista.filter(u => u.estado) : lista;
    this.usuariosFiltrados = base;
    this.totalPaginas = Math.ceil(base.length / this.itemsPorPagina);
    this.paginaActual = 1;
    this.actualizarPaginacion();
  }

  actualizarPaginacion(): void {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    this.usuariosPaginados = this.usuariosFiltrados.slice(inicio, fin);
  }

  cambiarPagina(nuevaPagina: number): void {
    if (nuevaPagina >= 1 && nuevaPagina <= this.totalPaginas) {
      this.paginaActual = nuevaPagina;
      this.actualizarPaginacion();
    }
  }

  onEstadoChange(event: Event, uid: string): void {
    const input = event.target as HTMLInputElement;
    this.cambiarEstado(uid, input.checked);
  }

  async cambiarEstado(uid: string, estado: boolean): Promise<void> {
    await this.usuariosService.actualizarEstado(uid, estado);
    this.todosLosUsuarios = this.todosLosUsuarios.map(usuario =>
      usuario.uid === uid ? { ...usuario, estado } : usuario
    );
    this.filtrarUsuarios(this.todosLosUsuarios);
  }

  async guardarNuevoRol(uid: string, nuevoRol: string): Promise<void> {
    await this.usuariosService.actualizarRol(uid, nuevoRol);
    this.todosLosUsuarios = this.todosLosUsuarios.map(usuario =>
      usuario.uid === uid ? { ...usuario, rol: nuevoRol, nuevoRol } : usuario
    );
    this.filtrarUsuarios(this.todosLosUsuarios);

    this.mostrarToast = true;
    setTimeout(() => (this.mostrarToast = false), 3000);
  }

  onToggleFiltro(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.mostrarSoloActivos = input.checked;
    this.buscarPorCedula();
  }

  buscarPorCedula(): void {
    const termino = this.cedulaBuscada.trim().toLowerCase();
    this.busquedaActiva = termino.length > 0;

    const coincidencias = this.todosLosUsuarios.filter(usuario =>
      usuario.cedula.toLowerCase().includes(termino) ||
      `${usuario.nombres} ${usuario.apellidos}`.toLowerCase().includes(termino)
    );

    const listaFinal = this.busquedaActiva ? coincidencias : this.todosLosUsuarios;
    this.filtrarUsuarios(listaFinal);
  }

  verPerfil(uid: string): void {
    this.router.navigate(['/perfil', uid]);
  }

  volverAlMenu(): void {
    this.router.navigate(['/menu']);
  }

  generarArrayPaginas(): number[] {
    return Array.from({ length: this.totalPaginas }, (_, i) => i + 1);
  }
}
