import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore, doc, getDoc, updateDoc, serverTimestamp } from '@angular/fire/firestore';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';

@Component({
  selector: 'app-actualizar-registro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './actualizar-registro.component.html',
  styleUrls: ['./actualizar-registro.component.scss']
})
export class ActualizarRegistroComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestore = inject(Firestore);

  id: string = '';
  registro: NuevoRegistro & { nombre?: string; unidad?: string } = {
    administracion: 0,
    minutosAtraso: 0,
    minutosBase: 0,
    multas: 0,
    adminPagada: 0,
    minBasePagados: 0,
    minutosPagados: 0,
    multasPagadas: 0,
    nombre: '',
    unidad: ''
  };

  async ngOnInit() {this.route.paramMap.subscribe(async params => {
    this.id = params.get('id')!;
    const ref = doc(this.firestore, 'reportesDiarios', this.id);
    const snap = await getDoc(ref);
  
    if (snap.exists()) {
      this.registro = snap.data() as NuevoRegistro & { nombre?: string; unidad?: string };
    } else {
      alert('❌ Registro no encontrado');
      this.router.navigate(['/reportes/lista-reportes']);
    }
  });
  }

  async guardar() {
    const ref = doc(this.firestore, 'reportesDiarios', this.id);
    await updateDoc(ref, {
      administracion: this.registro.administracion,
      minutosAtraso: this.registro.minutosAtraso,
      minutosBase: this.registro.minutosBase,
      multas: this.registro.multas,
      fechaModificacion: serverTimestamp()
    });
    alert('✅ Registro actualizado');
    this.router.navigate(['/reportes/lista-reportes']);
  };

  cancelar(): void {
    this.router.navigate(['/reportes/lista-reportes']);
  }
}