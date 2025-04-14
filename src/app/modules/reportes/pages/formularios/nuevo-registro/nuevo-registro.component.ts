import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { ReportesService } from '../../../services/reportes.service';
import { Router, ActivatedRoute } from '@angular/router';
import { Firestore, collection, getDocs, doc, getDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-nuevo-registro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nuevo-registro.component.html',
  styleUrls: ['./nuevo-registro.component.scss']
})

export class NuevoRegistroComponent {
  reporte: NuevoRegistro = {
    adminPagada: 0,
    administracion: 0,
    minBasePagados: 0,
    minutosAtraso: 0,
    minutosBase: 0,
    minutosPagados: 0,
    multas: 0,
    multasPagadas: 0,
    nombre: '',
    unidad: '',
    uid: '',
  };

  usuarios: { uid: string, nombre: string, unidad: string }[] = [];
  resultado: string | null = null;
  id: string | null = null;

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);

  constructor(private reportesService: ReportesService) {
    this.cargarUsuarios();
    this.cargarSiEsEdicion();
  }

  cancelar(): void {
    this.router.navigate(['/reportes/lista-reportes']);
  }

  async cargarUsuarios() {
    const ref = collection(this.firestore, 'usuarios');
    const snapshot = await getDocs(ref);
    this.usuarios = snapshot.docs.map(doc => ({
      uid: doc.id,
      nombre: doc.data()['nombres'],
      unidad: doc.data()['unidad']
    }));
  }

  seleccionarUsuario(uid: string) {
    const usuario = this.usuarios.find(u => u.uid === uid);
    if (usuario) {
      this.reporte.nombre = usuario.nombre;
      this.reporte.unidad = usuario.unidad;
      this.reporte.uid = usuario.uid;
    }
  }


  async cargarSiEsEdicion() {
    this.id = this.route.snapshot.paramMap.get('id');
    const uid = this.reporte.uid;
    if (this.id && uid) {
      const ref = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${this.id}`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.reporte = snap.data() as NuevoRegistro;
      } else {
        alert('❌ Registro no encontrado');
        this.router.navigate(['/reportes/lista-reportes']);
      }
    }
  }

  nombreBuscado: string = '';
  usuarioSeleccionado: any = null;
  actualizarUsuarioSeleccionado() {
    this.usuarioSeleccionado = this.usuarios.find(u => u.nombre.toLowerCase() === this.nombreBuscado.toLowerCase()) || null;
    if (this.usuarioSeleccionado) {
      this.reporte.uid = this.usuarioSeleccionado.uid;
      this.reporte.nombre = this.usuarioSeleccionado.nombre;
      this.reporte.unidad = this.usuarioSeleccionado.unidad;
    } else {
      this.reporte.uid = '';
      this.reporte.nombre = '';
      this.reporte.unidad = '';
    }
  }

  async enviar() {
    if (!this.reporte.uid || !this.reporte.nombre || !this.reporte.unidad) {
      alert('⚠️ Por favor selecciona un usuario válido.');
      return;
    }

    try {
      if (this.id) {
        await this.reportesService.actualizarReporteDiario(this.reporte.uid, this.id, this.reporte);
        this.resultado = `Registro actualizado: ${this.id}`;
      } else {
        const docRef = await this.reportesService.guardarReporteDiario(this.reporte.uid, this.reporte);
        this.resultado = docRef.id;
      }

      this.router.navigate(['/reportes/lista-reportes']);
    } catch (error) {
      console.error('❌ Error al guardar reporte:', error);
    }
  }
}



