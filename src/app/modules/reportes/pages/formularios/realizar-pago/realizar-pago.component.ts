import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, collection, getDocs } from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { Pago } from 'src/app/core/interfaces/pago.interface';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { FormsModule } from '@angular/forms';

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

  pagos: Record<CampoClave, Pago[]> = {
    minutosAtraso: [],
    administracion: [],
    minutosBase: [],
    multas: []
  };

  totales: Record<CampoClave, number> = {
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
    this.cargarPagos();
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

  async cargarPagos() {
    for (const cat of this.campos) {
      const ref = collection(this.firestore, `reportesDiarios/${this.reporteId}/pagos${this.capitalize(cat)}`);
      const snap = await getDocs(ref);
      const pagos = snap.docs.map(d => d.data() as Pago);
      this.pagos[cat] = pagos;
      this.totales[cat] = pagos.reduce((acc, p) => acc + p.cantidad, 0);
    }
  }

  capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  volver(): void {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}
