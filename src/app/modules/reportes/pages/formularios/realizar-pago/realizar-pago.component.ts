import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  collection,
  getDocs,
  Timestamp,
  addDoc
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Pago } from 'src/app/core/interfaces/pago.interface';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';

type CampoClave = 'minutosAtraso' | 'administracion' | 'minutosBase' | 'multas';

@Component({
  selector: 'app-realizar-pago',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './realizar-pago.component.html',
  styleUrls: ['./realizar-pago.component.scss']
})
export class RealizarPagoComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestore = inject(Firestore);

  reporteId: string = '';
  reporte!: NuevoRegistro;
  campos: CampoClave[] = ['minutosAtraso', 'administracion', 'minutosBase', 'multas'];

  // Pagos totales (unificados)
  pagosTotales: {
    fecha: Timestamp;
    minutosAtraso: number;
    administracion: number;
    minutosBase: number;
    multas: number;
  }[] = [];

  totales: Record<CampoClave, number> = {
    minutosAtraso: 0,
    administracion: 0,
    minutosBase: 0,
    multas: 0
  };

  // Lo que el usuario está ingresando como nuevo pago
  pagoActual: Record<CampoClave, number> = {
    minutosAtraso: 0,
    administracion: 0,
    minutosBase: 0,
    multas: 0
  };

  ngOnInit(): void {
    this.reporteId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.reporteId) {
      alert('❌ No se encontró ID');
      this.router.navigate(['/reportes/lista-reportes']);
      return;
    }

    this.cargarReporte();
    this.cargarPagosTotales();
  }

  async cargarReporte() {
    const ref = doc(this.firestore, 'reportesDiarios', this.reporteId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert('❌ Registro no encontrado');
      this.router.navigate(['/reportes/lista-reportes']);
      return;
    }

    this.reporte = snap.data() as NuevoRegistro;
  }

  async cargarPagosTotales() {
    const ref = collection(this.firestore, `reportesDiarios/${this.reporteId}/pagosTotales`);
    const snap = await getDocs(ref);
    this.pagosTotales = snap.docs.map(d => d.data() as any);

    // Recalcular totales
    for (const campo of this.campos) {
      this.totales[campo] = this.pagosTotales.reduce(
        (acc, pago) => acc + (pago[campo] || 0),
        0
      );
    }
  }

  calcularDeuda(modulo: CampoClave): number {
    const total = this.reporte?.[modulo] ?? 0;
    const pagado = this.totales?.[modulo] ?? 0;
    return Math.max(total - pagado, 0);
  }

  async registrarPagoTotal() {
    // Validar que haya al menos un valor mayor a 0
    const hayPago = this.campos.some(campo => this.pagoActual[campo] > 0);
    if (!hayPago) {
      alert('⚠️ Debes ingresar al menos un monto a pagar.');
      return;
    }

    const nuevoPago = {
      fecha: Timestamp.fromDate(new Date()),
      ...this.pagoActual
    };

    const ref = collection(this.firestore, `reportesDiarios/${this.reporteId}/pagosTotales`);
    await addDoc(ref, nuevoPago);

    alert('✅ Pago total registrado correctamente.');

    // Limpiar e ir a recargar
    this.pagoActual = {
      minutosAtraso: 0,
      administracion: 0,
      minutosBase: 0,
      multas: 0
    };
    await this.cargarPagosTotales();
  }

  get deudaTotal(): number {
    return this.campos.reduce((acc, campo) => acc + this.calcularDeuda(campo), 0);
  }

  volver(): void {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
