import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReportesService } from 'src/app/modules/reportes/services/reportes.service';
import { ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';
import { AuthService } from 'src/app/core/auth/services/auth.service'; 
@Component({
  selector: 'app-cuentas-por-cobrar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cuentas-por-cobrar.component.html',
  styleUrls: ['./cuentas-por-cobrar.component.scss']
})
export class CuentasPorCobrarComponent implements OnInit {
  esSocio: boolean = false;
  filtro: string = '';
  listaUnidades: { unidad: string; nombre: string }[] = [];
  unidadSeleccionada: string | null = null;
  reportesSeleccionados: ReporteConPagos[] = [];
  cargando: boolean = false;
  error: string = '';

  constructor(
    private reportesService: ReportesService,
    private router: Router,
    private authService: AuthService // ⬅️ Agrega esto
  ) {}

  async ngOnInit(): Promise<void> {
    this.authService.currentUserRole$.subscribe(role => {
    this.esSocio = role === 'socio';
  });
    this.cargando = true;
    try {
      this.listaUnidades = await this.reportesService.obtenerTodasLasUnidadesConNombre();
    } catch (error) {
      this.error = 'Error al cargar las unidades';
      console.error(error);
    } finally {
      this.cargando = false;
    }
  }

  async seleccionarUnidad(unidad: string) {
    this.cargando = true;
    this.error = '';
    this.unidadSeleccionada = unidad;

    try {
      const reportes = await this.reportesService.obtenerReportePorUnidad(unidad);
      if (reportes && reportes.length > 0) {
        this.reportesSeleccionados = reportes;
      } else {
        this.reportesSeleccionados = [];
        this.error = 'No se encontraron reportes para esta unidad.';
      }
    } catch (err) {
      this.reportesSeleccionados = [];
      this.error = 'Ocurrió un error al buscar los reportes.';
    } finally {
      this.cargando = false;
    }
  }

  get saldoAdministracion(): number {
    return this.reportesSeleccionados.reduce((acc, r) =>
      acc + (r.administracion - r.adminPagada), 0);
  }

  get saldoMinBase(): number {
    return this.reportesSeleccionados.reduce((acc, r) =>
      acc + (r.minutosBase - r.minBasePagados), 0);
  }

  get saldoAtraso(): number {
    return this.reportesSeleccionados.reduce((acc, r) =>
      acc + (r.minutosAtraso - r.minutosPagados), 0);
  }

  get saldoMultas(): number {
    return this.reportesSeleccionados.reduce((acc, r) =>
      acc + (r.multas - r.multasPagadas), 0);
  }

  get total(): number {
    return this.saldoAdministracion + this.saldoMinBase + this.saldoAtraso + this.saldoMultas;
  }

  generarPago(): void {
    if (this.reportesSeleccionados.length > 0) {
      const { uid, id } = this.reportesSeleccionados[0];
      this.router.navigate(['/reportes/realizar-pago', uid, id]);
    }
  }

  get unidadesFiltradas() {
    return this.listaUnidades.filter(item =>
      item.unidad.toLowerCase().includes(this.filtro.toLowerCase()) ||
      item.nombre.toLowerCase().includes(this.filtro.toLowerCase())
    );
  }
  volver() {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
