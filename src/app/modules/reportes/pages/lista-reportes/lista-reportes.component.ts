import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, query, where, Timestamp, orderBy } from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; // 👈 Necesario para ngModel

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss']
})
export class ReporteListaComponent implements OnInit {
  reportes: (NuevoRegistro & { id: string })[] = [];
  private firestore = inject(Firestore);
  private router = inject(Router);

  mostrarFiltros = false;
  fechaPersonalizada: string = '';

  async ngOnInit(): Promise<void> {
    await this.cargarTodosLosReportes();
  }

  async cargarTodosLosReportes() {
    const ref = collection(this.firestore, 'reportesDiarios');
    const q = query(ref, orderBy('fechaModificacion', 'desc'));
    const snapshot = await getDocs(ref);
    this.reportes = snapshot.docs.map(doc => ({
      ...(doc.data() as NuevoRegistro),
      id: doc.id
    }));
    console.log('✅ Reportes procesados:', this.reportes);
  }

  irANuevoRegistro(): void {
    this.router.navigate(['/reportes/nuevo-registro']);
  }

  irAEditar(id: string): void {
    this.router.navigate(['/reportes/actualizar', id]);
  }

  async filtrarPor(tipo: 'hoy' | 'semana' | 'mes') {
    const hoy = new Date();
    let fechaInicio: Date;
    const fechaFin = new Date(hoy);

    if (tipo === 'hoy') {
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    } else if (tipo === 'semana') {
      const diaSemana = hoy.getDay(); // 0 (domingo) a 6 (sábado)
      fechaInicio = new Date(hoy);
      fechaInicio.setDate(hoy.getDate() - diaSemana);
    } else {
      // mes
      fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    }

    await this.consultarReportesEnRango(fechaInicio, fechaFin);
  }

  async filtrarPorFechaPersonalizada() {
    if (!this.fechaPersonalizada) return;
  
    const partes = this.fechaPersonalizada.split('-'); // yyyy-mm-dd
    const anio = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1; // meses en JS son 0-indexados
    const dia = parseInt(partes[2], 10);
  
    const fechaInicio = new Date(anio, mes, dia, 0, 0, 0, 0);
    const fechaFin = new Date(anio, mes, dia, 23, 59, 59, 999);
  
    console.log('📆 Fecha seleccionada (ajustada):', fechaInicio, fechaFin);
  
    await this.consultarReportesEnRango(fechaInicio, fechaFin);
  }

  async consultarReportesEnRango(fechaInicio: Date, fechaFin: Date) {
    const start = Timestamp.fromDate(new Date(fechaInicio));
    const end = Timestamp.fromDate(new Date(fechaFin.setHours(23, 59, 59, 999)));

    const ref = collection(this.firestore, 'reportesDiarios');
    const q = query(ref, where('fechaModificacion', '>=', start), where('fechaModificacion', '<=', end));
    const snapshot = await getDocs(q);
    console.log('📤 Consulta entre:', start.toDate(), 'y', end.toDate());
    console.log('📥 Documentos encontrados:', snapshot.size);
    this.reportes = snapshot.docs.map(doc => ({
      ...(doc.data() as NuevoRegistro),
      id: doc.id
    }));
  }
}