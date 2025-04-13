import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  doc,
  getDoc,
  collection,
  getDocs,
  Timestamp,
  addDoc,
  collection as fsCollection
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { PagoPorModulo } from 'src/app/core/interfaces/pagoPorModulo.interface';

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

  uidUsuario: string = '';
  registros: NuevoRegistro[] = [];
  pagosTotales: Record<CampoClave, PagoPorModulo[]> = {
    minutosAtraso: [],
    administracion: [],
    minutosBase: [],
    multas: []
  };
  pagosActuales: Record<string, Partial<Record<CampoClave, number>>> = {};
  campos: CampoClave[] = ['minutosAtraso', 'administracion', 'minutosBase', 'multas'];

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/reportes/lista-reportes']);
      return;
    }

    const ref = doc(this.firestore, 'reportesDiarios', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      alert('Registro no encontrado');
      return;
    }

    const data = snap.data() as NuevoRegistro;
    this.uidUsuario = data.uid ?? '';
    await this.cargarRegistrosDelUsuario(this.uidUsuario);
    await this.cargarPagosTotales(id); // solo del usuario actual
  }

  async cargarRegistrosDelUsuario(uid: string) {
    const ref = collection(this.firestore, 'reportesDiarios');
    const snap = await getDocs(ref);
    this.registros = snap.docs
      .map(d => ({ ...(d.data() as NuevoRegistro), id: d.id }))
      .filter(r => r.uid === uid);

    for (const r of this.registros) {
      this.pagosActuales[r.id!] = {};
    }
  }

  async cargarPagosTotales(reporteId: string) {
    for (const campo of this.campos) {
      const ref = collection(this.firestore, `reportesDiarios/${reporteId}/pagosTotales`);
      const snap = await getDocs(ref);
      const pagos = snap.docs.map(doc => doc.data()) as any[];

      this.pagosTotales[campo] = pagos
        .flatMap(p => p[campo] ? [{ cantidad: p[campo], fecha: p.fecha, reporteId }] : []);
    }
  }

  async guardarPagosGenerales() {
    const fecha = Timestamp.fromDate(new Date());

    for (const registro of this.registros) {
      const pagosPorModulo: Partial<Record<CampoClave, number>> = {};
      let tienePago = false;

      for (const campo of this.campos) {
        const monto = this.pagosActuales[registro.id!]?.[campo] ?? 0;
        if (monto > 0) {
          pagosPorModulo[campo] = monto;
          tienePago = true;
        }
      }

      if (!tienePago) continue;

      const ref = collection(this.firestore, `reportesDiarios/${registro.id}/pagosTotales`);
      await addDoc(ref, {
        ...pagosPorModulo,
        fecha
      });
    }

    alert('✅ Pago registrado correctamente.');
    this.router.navigate(['/reportes/lista-reportes']);
  }

  calcularDeuda(registro: NuevoRegistro, campo: CampoClave): number {
    const total = registro[campo as keyof NuevoRegistro] as number;
    const pagado = this.pagosTotales[campo]
      .filter(p => p.reporteId === registro.id)
      .reduce((acc, p) => acc + p.cantidad, 0);
    return Math.max(total - pagado, 0);
  }

  filtrarPagosPorRegistro(campo: CampoClave, registroId: string): PagoPorModulo[] {
    return this.pagosTotales[campo]?.filter(p => p.reporteId === registroId) || [];
  }
  
  calcularTotalPagado(campo: CampoClave, registroId: string): number {
    return this.filtrarPagosPorRegistro(campo, registroId)
      .reduce((acc, p) => acc + p.cantidad, 0);
  }
  
  calcularTotalGeneral(): number {
    let total = 0;
    for (const registro of this.registros) {
      for (const campo of this.campos) {
        const deuda = this.calcularDeuda(registro, campo);
        const actual = this.pagosActuales[registro.id!]?.[campo] ?? 0;
        total += Math.min(deuda, actual);
      }
    }
    return total;
  }

  validarPago(reporteId: string, campo: CampoClave) {
    const deuda = this.registros.find(r => r.id === reporteId)
      ? this.calcularDeuda(this.registros.find(r => r.id === reporteId)!, campo)
      : 0;
    const actual = this.pagosActuales[reporteId]?.[campo] ?? 0;
    if (actual > deuda) {
      this.pagosActuales[reporteId][campo] = deuda;
    }
  }

  volver() {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
