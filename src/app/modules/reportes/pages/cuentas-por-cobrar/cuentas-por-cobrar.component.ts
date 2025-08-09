import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ReportesService } from 'src/app/modules/reportes/services/reportes.service';
import { ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';
import { AuthService } from 'src/app/core/auth/services/auth.service'; 
import { forkJoin, firstValueFrom, take, } from 'rxjs'; // ⬅️ Add this import

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
  listaUnidades: { unidad: string; nombre: string; uid: string }[] = []; // ⬅️ Added uid
  unidadSeleccionada: string | null = null;
  reportesSeleccionados: ReporteConPagos[] = [];
  reportesConFechaConvertida: any[] = []; 
  error: string = '';
  cargandoUnidades: boolean = false;
  cargandoReportes: boolean = false;
  constructor(
    private reportesService: ReportesService,
    private router: Router,
    private authService: AuthService
  ) {}

async ngOnInit(): Promise<void> {
    this.cargandoUnidades = true;
    try {
        const [role, unidades] = await firstValueFrom(
            forkJoin([
                this.authService.currentUserRole$.pipe(take(1)), // ⬅️ Usa take(1) para que se complete
                this.reportesService.obtenerTodasLasUnidadesConNombre()
            ])
        );
        
        this.esSocio = role === 'socio';
        this.listaUnidades = unidades;
    } catch (error) {
        this.error = 'Error al cargar las unidades o el rol del usuario';
        console.error(error);
    } finally {
        this.cargandoUnidades = false;
    }
}


async seleccionarUnidad(unidad: string, uid: string) {
   this.cargandoReportes = true;
    this.error = '';
    this.unidadSeleccionada = unidad;

    try {
      const reportes = await this.reportesService.obtenerReportePorUnidad(unidad);

      if (reportes && reportes.length > 0) {
        this.reportesSeleccionados = reportes;
        
        // ➡️ Convierte el Timestamp a Date aquí para mostrarlo en el HTML
        this.reportesConFechaConvertida = this.reportesSeleccionados.map(r => ({
            ...r,
            // Asume que 'fecha' existe en el objeto del reporte, aunque no en la interfaz
            fechaDisplay: (r as any).fecha?.toDate()
        }));
      } else {
        this.reportesSeleccionados = [];
        this.reportesConFechaConvertida = [];
        this.error = 'No se encontraron reportes para esta unidad.';
      }
    } catch (err) {
      this.reportesSeleccionados = [];
      this.reportesConFechaConvertida = [];
      this.error = 'Ocurrió un error al buscar los reportes.';
    } finally {
      this.cargandoReportes = false;
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