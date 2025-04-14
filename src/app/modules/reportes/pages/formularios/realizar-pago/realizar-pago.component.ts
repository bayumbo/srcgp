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
  collection as fsCollection,
  updateDoc
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { PagoPorModulo } from 'src/app/core/interfaces/pagoPorModulo.interface';
import { DocumentoPago } from 'src/app/core/interfaces/documentoPago.interface';

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
  reporteId: string = '';
  registros: NuevoRegistro[] = [];

  pagosTotales: Record<CampoClave, PagoPorModulo[]> = {
    minutosAtraso: [],
    administracion: [],
    minutosBase: [],
    multas: []
  };

  pagosActuales: Record<string, Partial<Record<CampoClave, number>>> = {};
  campos: CampoClave[] = ['minutosAtraso', 'administracion', 'minutosBase', 'multas'];
  pagoEnEdicion: { id: string; campo: CampoClave } | null = null;
  nuevoMonto: number | null = null;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    const uid = this.route.snapshot.paramMap.get('uid');
    if (!id || !uid) {
      this.router.navigate(['/reportes/lista-reportes']);
      return;
    }

    this.uidUsuario = uid;
    this.reporteId = id;

    const ref = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${id}`);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert('Registro no encontrado');
      return;
    }

    const data = snap.data() as NuevoRegistro;

    await this.cargarRegistrosDelUsuario(uid);
    await this.cargarPagosTotales();;
  }

  async cargarRegistrosDelUsuario(uid: string) {
    const ref = collection(this.firestore, `usuarios/${uid}/reportesDiarios`);
    const snap = await getDocs(ref);
    this.registros = snap.docs.map(d => ({
      ...(d.data() as NuevoRegistro),
      id: d.id
    }));

    for (const r of this.registros) {
      this.pagosActuales[r.id!] = {};
    }

    console.log('📄 registros:', this.registros);
  }

  async cargarPagosTotales() {
    // Limpia el estado de pagos anteriores
    for (const campo of this.campos) {
      this.pagosTotales[campo] = [];
    }
  
    for (const registro of this.registros) {
      const reporteId = registro.id!;
      const ref = fsCollection(
        this.firestore,
        `usuarios/${this.uidUsuario}/reportesDiarios/${reporteId}/pagosTotales`
      );
  
      const snap = await getDocs(ref);
  
      const pagos: DocumentoPago[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<DocumentoPago, 'id'>)
      }));
  
      for (const campo of this.campos) {
        const nuevosPagos = pagos
          .flatMap(p => {
            const cantidad = p.detalles?.[campo] ?? 0;
            return cantidad > 0
              ? [{ id: p.id, cantidad, fecha: p.fecha, reporteId }]
              : [];
          });
  
        this.pagosTotales[campo].push(...nuevosPagos);
      }
    }
  
    console.log('💰 Pagos cargados:', this.pagosTotales);
  }

  async guardarPagosGenerales() {
    const fecha = Timestamp.fromDate(new Date());
  
    for (const registro of this.registros) {
      const detalles: Partial<Record<CampoClave, number>> = {};
      let tienePago = false;
  
      for (const campo of this.campos) {
        const monto = this.pagosActuales[registro.id!]?.[campo] ?? 0;
        if (monto > 0) {
          detalles[campo] = monto;
          tienePago = true;
        }
      }
  
      if (!tienePago) continue;
  
      const ref = collection(this.firestore, `usuarios/${this.uidUsuario}/reportesDiarios/${registro.id}/pagosTotales`);
      await addDoc(ref, {
        fecha,
        detalles
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
    const registro = this.registros.find(r => r.id === reporteId);
    const deuda = registro ? this.calcularDeuda(registro, campo) : 0;
    const actual = this.pagosActuales[reporteId]?.[campo] ?? 0;
    if (actual > deuda) {
      this.pagosActuales[reporteId][campo] = deuda;
    }
  }

  async editarPago(pago: PagoPorModulo, campo: CampoClave) {
    const nuevoValor = prompt(`Editar monto de ${campo}`, pago.cantidad.toString());
  
    if (nuevoValor === null) return; // cancelado
    const cantidad = Number(nuevoValor);
  
    if (isNaN(cantidad) || cantidad < 0) {
      alert('⚠️ Valor inválido');
      return;
    }
  
    const ref = doc(this.firestore, `usuarios/${this.uidUsuario}/reportesDiarios/${pago.reporteId}/pagosTotales/${pago.id}`);
  
    try {
      await updateDoc(ref, {
        [`detalles.${campo}`]: cantidad
      });
  
      alert('✅ Pago actualizado');
      await this.cargarPagosTotales(); // actualiza la vista
    } catch (error) {
      console.error('❌ Error al actualizar pago:', error);
      alert('Error al actualizar el pago.');
    }
  }

  iniciarEdicion(pago: PagoPorModulo, campo: CampoClave) {
    this.pagoEnEdicion = { id: pago.id, campo };
    this.nuevoMonto = pago.cantidad;
  }
  async guardarEdicion() {
    if (this.pagoEnEdicion && this.nuevoMonto != null && this.nuevoMonto >= 0) {
      const { id, campo } = this.pagoEnEdicion;
      const pago = this.campos
        .flatMap(c => this.pagosTotales[c])
        .find(p => p.id === id);
  
      if (!pago) return;
  
      const ref = doc(this.firestore, `usuarios/${this.uidUsuario}/reportesDiarios/${pago.reporteId}/pagosTotales/${pago.id}`);
      await updateDoc(ref, {
        [`detalles.${campo}`]: this.nuevoMonto
      });
  
      alert('✅ Pago actualizado');
      await this.cargarPagosTotales();
  
      // Limpieza
      this.pagoEnEdicion = null;
      this.nuevoMonto = null;
    }
  }
  esPagoEnEdicion(pago: PagoPorModulo, campo: CampoClave): boolean {
    return this.pagoEnEdicion?.id === pago.id && this.pagoEnEdicion?.campo === campo;
  }
  cancelarEdicion() {
    this.pagoEnEdicion = null;
    this.nuevoMonto = null;
  }
  volver() {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
