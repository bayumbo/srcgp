import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, doc, collection as fsCollection, query, where, Timestamp, orderBy, collectionGroup } from '@angular/fire/firestore';
import { NuevoRegistro, ReporteConPagos } from 'src/app/core/interfaces/reportes.interface';
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
  reportes: ReporteConPagos[] = [];

  mostrarFiltros = false;
  fechaPersonalizada: string = '';

  private firestore = inject(Firestore);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.cargarTodosLosReportes();
  }

  async cargarTodosLosReportes() {
    const ref = query(
      collectionGroup(this.firestore, 'reportesDiarios'),
      orderBy('fechaModificacion', 'desc')
    );
    const snapshot = await getDocs(ref);
    const tempReportes = [];
  
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as NuevoRegistro;
      const id = docSnap.id;
  
      // 🔎 Obtener el path del documento para ubicar uid
      const pathParts = docSnap.ref.path.split('/');
      const uid = pathParts[1]; // usuarios/{uid}/reportesDiarios/{id}
  
      const pagosRef = fsCollection(this.firestore, `usuarios/${uid}/reportesDiarios/${id}/pagosTotales`);
      const pagosSnap = await getDocs(pagosRef);
  
      let minutosPagados = 0;
      let adminPagada = 0;
      let minBasePagados = 0;
      let multasPagadas = 0;
  
      pagosSnap.forEach(pagoDoc => {
        const pago = pagoDoc.data();
        const detalles = pago['detalles'] ?? {};
      
        minutosPagados += detalles.minutosAtraso || 0;
        adminPagada += detalles.administracion || 0;
        minBasePagados += detalles.minutosBase || 0;
        multasPagadas += detalles.multas || 0;
      });
  
      tempReportes.push({
        ...data,
        id,
        uid,
        minutosPagados,
        adminPagada,
        minBasePagados,
        multasPagadas
      });
    }
  
    this.reportes = tempReportes;
  }
  

  async consultarReportesEnRango(fechaInicio: Date, fechaFin: Date) {
    const start = Timestamp.fromDate(fechaInicio);
    const end = Timestamp.fromDate(new Date(fechaFin.setHours(23, 59, 59, 999)));
  
    const ref = query(
      collectionGroup(this.firestore, 'reportesDiarios'),
      where('fechaModificacion', '>=', start),
      where('fechaModificacion', '<=', end),
      orderBy('fechaModificacion', 'desc')
    );
    const snapshot = await getDocs(ref);
  
    const tempReportes = [];
  
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data() as NuevoRegistro;
      const id = docSnap.id;
      const pathParts = docSnap.ref.path.split('/');
      const uid = pathParts[1];
  
      const pagosRef = fsCollection(this.firestore, `usuarios/${uid}/reportesDiarios/${id}/pagosTotales`);
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
        uid,
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
    let fechaFin: Date;
  
    if (tipo === 'hoy') {
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
      fechaFin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);
    } else if (tipo === 'semana') {
      const diaActual = hoy.getDay(); // 0=Domingo, 1=Lunes...
      const diferencia = diaActual === 0 ? 6 : diaActual - 1; // inicio en lunes
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - diferencia);
      fechaInicio.setHours(0, 0, 0, 0);
  
      fechaFin = new Date(hoy);
      fechaFin.setHours(23, 59, 59, 999);
    } else {
      // mes
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0);
      fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59); // último día del mes
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

  irAEditar(uid: string, id: string): void {
    console.log('🧭 Navegando a:', uid, id);
    this.router.navigate([`/reportes/actualizar`, uid, id]);
  }
  

  irAPagar(uid: string, id: string): void {
    this.router.navigate([`/reportes/realizar-pago`, uid, id]);
  }

  irACuentasPorCobrar() {
    this.router.navigate(['/reportes/cuentas-por-cobrar']);
  }
  irACierreCaja() {
    this.router.navigate(['/reportes/cierre-caja']);
  }
  volver() {
    this.router.navigate(['']);
  }
}

