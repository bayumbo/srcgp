import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReportesService } from 'src/app/modules/reportes/services/reportes.service';
import { ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';

@Component({
  selector: 'app-cuentas-por-cobrar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cuentas-por-cobrar.component.html',
  styleUrls: ['./cuentas-por-cobrar.component.scss']
})
export class CuentasPorCobrarComponent implements OnInit {
  filtro: string = '';
  listaUnidades: { unidad: string; nombre: string }[] = [];
  unidadSeleccionada: ReporteConPagos | null = null;
  cargando: boolean = false;
  error: string = '';

  constructor(
    private reportesService: ReportesService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
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
    try {
      const reporte = await this.reportesService.obtenerReportePorUnidad(unidad);
      if (reporte) {
        this.unidadSeleccionada = reporte;
      } else {
        this.unidadSeleccionada = null;
        this.error = 'No se encontró reporte para esta unidad.';
      }
    } catch (err) {
      this.error = 'Ocurrió un error al buscar el reporte.';
    } finally {
      this.cargando = false;
    }
  }

  get saldoAdministracion(): number {
    return (this.unidadSeleccionada?.administracion ?? 0) - (this.unidadSeleccionada?.adminPagada ?? 0);
  }

  get saldoMinBase(): number {
    return (this.unidadSeleccionada?.minutosBase ?? 0) - (this.unidadSeleccionada?.minBasePagados ?? 0);
  }

  get saldoAtraso(): number {
    return (this.unidadSeleccionada?.minutosAtraso ?? 0) - (this.unidadSeleccionada?.minutosPagados ?? 0);
  }

  get saldoMultas(): number {
    return (this.unidadSeleccionada?.multas ?? 0) - (this.unidadSeleccionada?.multasPagadas ?? 0);
  }

  get total(): number {
    return this.saldoAdministracion + this.saldoMinBase + this.saldoAtraso + this.saldoMultas;
  }

  generarPago(uid: string, id: string): void {
    this.router.navigate([`/reportes/realizar-pago`, uid, id]);
  }
  

  get unidadesFiltradas() {
    return this.listaUnidades.filter(item =>
      item.unidad.toLowerCase().includes(this.filtro.toLowerCase()) ||
      item.nombre.toLowerCase().includes(this.filtro.toLowerCase())
    );
  }
}
