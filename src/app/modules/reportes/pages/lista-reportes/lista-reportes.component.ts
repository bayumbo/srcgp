import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, doc, collection as fsCollection, query, where, Timestamp, orderBy } from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Pago } from 'src/app/core/interfaces/pago.interface';

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss']
})
export class ReporteListaComponent implements OnInit {
  reportes: (NuevoRegistro & {
    id: string;
    minutosPagados: number;
    adminPagada: number;
    minBasePagados: number;
    multasPagadas: number;
  })[] = [];

  mostrarFiltros = false;
  fechaPersonalizada: string = '';

  private firestore = inject(Firestore);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.cargarTodosLosReportes();
  }

  async cargarTodosLosReportes() {
    const ref = collection(this.firestore, 'reportesDiarios');
    const q = query(ref, orderBy('fechaModificacion', 'desc'));
    const snapshot = await getDocs(q);

    const tempReportes = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as NuevoRegistro;
      const id = docSnap.id;

      // ✅ forma correcta de acceder a subcolección
      const docRef = doc(this.firestore, 'reportesDiarios', id);
      const pagosRef = fsCollection(docRef, 'pagosTotales');
      const pagosSnap = await getDocs(pagosRef);

      let minutosPagados = 0;
      let adminPagada = 0;
      let minBasePagados = 0;
      let multasPagadas = 0;

      pagosSnap.forEach(pagoDoc => {
        const pago = pagoDoc.data() as Pago;
        minutosPagados += pago.minutosAtraso || 0;
        adminPagada += pago.administracion || 0;
        minBasePagados += pago.minutosBase || 0;
        multasPagadas += pago.multas || 0;
      });

      tempReportes.push({
        ...data,
        id,
        minutosPagados,
        adminPagada,
        minBasePagados,
        multasPagadas
      });
    }

    this.reportes = tempReportes;
  }

  async consultarReportesEnRango(fechaInicio: Date, fechaFin: Date) {
    const start = Timestamp.fromDate(new Date(fechaInicio));
    const end = Timestamp.fromDate(new Date(fechaFin.setHours(23, 59, 59, 999)));

    const ref = collection(this.firestore, 'reportesDiarios');
    const q = query(ref, where('fechaModificacion', '>=', start), where('fechaModificacion', '<=', end));
    const snapshot = await getDocs(q);

    const tempReportes = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as NuevoRegistro;
      const id = docSnap.id;

      const docRef = doc(this.firestore, 'reportesDiarios', id);
      const pagosRef = fsCollection(docRef, 'pagosTotales');
      const pagosSnap = await getDocs(pagosRef);

      let minutosPagados = 0;
      let adminPagada = 0;
      let minBasePagados = 0;
      let multasPagadas = 0;

      pagosSnap.forEach(pagoDoc => {
        const pago = pagoDoc.data() as Pago;
        minutosPagados += pago.minutosAtraso || 0;
        adminPagada += pago.administracion || 0;
        minBasePagados += pago.minutosBase || 0;
        multasPagadas += pago.multas || 0;
      });

      tempReportes.push({
        ...data,
        id,
        minutosPagados,
        adminPagada,
        minBasePagados,
        multasPagadas
      });
    }

    this.reportes = tempReportes;
  }

  async filtrarPor(tipo: 'hoy' | 'semana' | 'mes') {
    const hoy = new Date();
    let fechaInicio: Date;
    const fechaFin = new Date(hoy);

    if (tipo === 'hoy') {
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    } else if (tipo === 'semana') {
      const diaSemana = hoy.getDay();
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - diaSemana);
    } else {
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    }

    await this.consultarReportesEnRango(fechaInicio, fechaFin);
  }

  async filtrarPorFechaPersonalizada() {
    if (!this.fechaPersonalizada) return;

    const [anio, mes, dia] = this.fechaPersonalizada.split('-').map(Number);
    const fechaInicio = new Date(anio, mes - 1, dia, 0, 0, 0);
    const fechaFin = new Date(anio, mes - 1, dia, 23, 59, 59);

    await this.consultarReportesEnRango(fechaInicio, fechaFin);
  }

  irANuevoRegistro(): void {
    this.router.navigate(['/reportes/nuevo-registro']);
  }

  irAEditar(id: string): void {
    this.router.navigate(['/reportes/actualizar', id]);
  }

  irAPagar(id: string): void {
    this.router.navigate(['/reportes/realizar-pago', id]);
  }
}
