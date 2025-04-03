import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';

@Component({
  selector: 'app-reporte-lista',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lista-reportes.component.html',
  styleUrls: ['./lista-reportes.component.scss']
})
export class ReporteListaComponent implements OnInit {
  reportes: NuevoRegistro[] = [];
  private firestore = inject(Firestore);

  async ngOnInit(): Promise<void> {
    const ref = collection(this.firestore, 'reportesDiarios');
    const snapshot = await getDocs(ref);
    this.reportes = snapshot.docs.map(doc => ({
      ...(doc.data() as NuevoRegistro),
      id: doc.id
    }));
    console.log('✅ Reportes procesados:', this.reportes);
  }
}
