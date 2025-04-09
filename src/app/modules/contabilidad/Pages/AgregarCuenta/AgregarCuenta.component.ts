import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CatalogoService } from '../../Services/comprobante.service';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-agregar-cuenta',
  standalone: true,
  templateUrl: './agregarcuenta.component.html',
  styleUrls: ['./stylesagregarcuenta.scss'],
  imports: [CommonModule, ReactiveFormsModule, RouterModule, FormsModule]
})
export class AgregarCuentaComponent implements OnInit {
  formCuenta!: FormGroup;
  cuentasOriginal: any[] = [];
  cuentasFiltradas: any[] = [];
  cuentaEnEdicion: string | null = null;
  cuentaEditada: any = {};
  busqueda: string = '';
  filtroTipo: string = '';
  tiposCuenta: string[] = ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'];
  mostrarTabla: boolean = false;

  constructor(private fb: FormBuilder, private catalogoService: CatalogoService) {}

  ngOnInit(): void {
    this.formCuenta = this.fb.group({
      codigo: ['', Validators.required],
      nombre: ['', Validators.required],
      tipo: ['', Validators.required]
    });

    this.obtenerCuentas();

    // Escuchamos cambios en filtros cada cierto tiempo
    setInterval(() => this.aplicarFiltros(), 300);
  }

  async agregarCuenta(): Promise<void> {
    if (this.formCuenta.invalid) {
      this.formCuenta.markAllAsTouched();
      alert('⚠️ Completa todos los campos antes de agregar una cuenta.');
      return;
    }

    await this.catalogoService.agregarCuenta(this.formCuenta.value);
    alert('✅ Cuenta agregada correctamente');
    this.formCuenta.reset();
    this.obtenerCuentas();
  }

  async obtenerCuentas(): Promise<void> {
    this.cuentasOriginal = await this.catalogoService.obtenerCuentas();
    this.aplicarFiltros();

    // Ocultar preloader
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) preloader.style.display = 'none';
    }, 600);
  }

  aplicarFiltros(): void {
    this.cuentasFiltradas = this.cuentasOriginal.filter(cuenta => {
      const coincideTexto = cuenta.codigo.toLowerCase().includes(this.busqueda.toLowerCase()) ||
                            cuenta.nombre.toLowerCase().includes(this.busqueda.toLowerCase());
      const coincideTipo = this.filtroTipo ? cuenta.tipo === this.filtroTipo : true;
      return coincideTexto && coincideTipo;
    });
    this.paginaActual = 1; // Reinicia paginación
  }


  editarCuenta(cuenta: any): void {
    this.cuentaEnEdicion = cuenta.id;
    this.cuentaEditada = { ...cuenta };
  }

  cancelarEdicion(): void {
    this.cuentaEnEdicion = null;
    this.cuentaEditada = {};
  }

  guardarEdicion(id: string): void {
    if (!this.cuentaEditada.codigo || !this.cuentaEditada.nombre || !this.cuentaEditada.tipo) {
      alert('⚠️ Completa todos los campos para guardar.');
      return;
    }

    this.catalogoService.actualizarCuenta(id, this.cuentaEditada)
      .then(() => {
        alert('✅ Cuenta actualizada.');
        this.obtenerCuentas();
        this.cancelarEdicion();
      })
      .catch(err => {
        console.error('❌ Error al actualizar cuenta:', err);
        alert('❌ Hubo un error al guardar los cambios.');
      });
  }

  async eliminarCuenta(id: string): Promise<void> {
    if (confirm('¿Seguro que deseas eliminar esta cuenta?')) {
      await this.catalogoService.eliminarCuenta(id);
      this.obtenerCuentas();
    }
  }

  verCuentasRegistradas(): void {
    this.mostrarTabla = !this.mostrarTabla;
    if (this.mostrarTabla) {
      this.obtenerCuentas();
    }
  }
  
// Paginación
paginaActual: number = 1;
registrosPorPagina: number = 10;

get totalPaginas(): number {
  return Math.ceil(this.cuentasFiltradas.length / this.registrosPorPagina);
}

get cuentasPaginadas(): any[] {
  const inicio = (this.paginaActual - 1) * this.registrosPorPagina;
  return this.cuentasFiltradas.slice(inicio, inicio + this.registrosPorPagina);
}

cambiarPagina(pagina: number): void {
  if (pagina >= 1 && pagina <= this.totalPaginas) {
    this.paginaActual = pagina;
  }
}







}