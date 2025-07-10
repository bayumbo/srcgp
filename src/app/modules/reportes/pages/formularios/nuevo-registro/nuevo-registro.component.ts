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
    apellido:'',
    unidad: '',
    uid: '',
    fechaModificacion: new Date(),
    
  };

  usuarios: { uid: string; nombre: string; apellido: string; unidad: string[]}[] = [];
  nombreBuscado: string = '';
  usuarioSeleccionado: { uid: string; nombre: string; apellido: string; unidad: string[] } | null = null;
  unidadesDisponibles: string[] = [];
  resultado: string | null = null;
  id: string | null = null;
  fechaInput: string = '';
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);

  constructor(private reportesService: ReportesService) {
    this.cargarUsuarios();
    this.cargarSiEsEdicion();
    this.fechaInput = this.reporte.fechaModificacion instanceof Date
  ? this.reporte.fechaModificacion.toISOString().split('T')[0]
  : '';
  }

  cancelar(): void {
    this.router.navigate(['/reportes/lista-reportes']);
  }

 async cargarUsuarios() {
  const ref = collection(this.firestore, 'usuarios');
  const snapshot = await getDocs(ref);

  const usuariosConUnidades = await Promise.all(snapshot.docs.map(async docSnap => {
    const uid = docSnap.id;
    const nombre = docSnap.data()['nombres'];
    const apellido = docSnap.data()['apellidos'];

    const unidadesRef = collection(this.firestore, `usuarios/${uid}/unidades`);
    const unidadesSnap = await getDocs(unidadesRef);
    const unidad = unidadesSnap.docs.map(u => u.data()['nombre']) || [];

    return { uid, nombre, apellido, unidad };
  }));

  this.usuarios = usuariosConUnidades;
}


    seleccionarUsuario(uid: string) {
    const usuario = this.usuarios.find(u => u.uid === uid);
    if (usuario) {
      this.reporte.nombre = usuario.nombre;
      this.reporte.apellido = usuario.apellido;
      this.reporte.unidad = '';
      this.reporte.uid = usuario.uid;
    }
  }


  async cargarSiEsEdicion() {
    this.id = this.route.snapshot.paramMap.get('id');
    const uid = this.route.snapshot.paramMap.get('uid'); // ahora lo leemos directo de la URL

    if (this.id && uid) {
      const ref = doc(this.firestore, `usuarios/${uid}/reportesDiarios/${this.id}`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.reporte = snap.data() as NuevoRegistro;
        this.reporte.uid = uid;
      } else {
        alert('❌ Registro no encontrado');
        this.router.navigate(['/reportes/lista-reportes']);
      }
    }
  }

actualizarUsuarioSeleccionado() {
  this.usuarioSeleccionado = this.usuarios.find(u =>
    `${u.nombre} ${u.apellido}`.toLowerCase() === this.nombreBuscado.toLowerCase()
  ) || null;

  if (this.usuarioSeleccionado) {
    this.reporte.uid = this.usuarioSeleccionado.uid;
    this.reporte.nombre = this.usuarioSeleccionado.nombre;
    this.reporte.apellido = this.usuarioSeleccionado.apellido;
    this.unidadesDisponibles = this.usuarioSeleccionado.unidad;
    this.reporte.unidad = ''; // se obliga a seleccionar manualmente
  } else {
    this.reporte.uid = '';
    this.reporte.nombre = '';
    this.reporte.apellido = '';
    this.reporte.unidad = '';
    this.unidadesDisponibles = [];
  }
}

  async enviar() {
    if (!this.reporte.uid || !this.reporte.nombre || !this.reporte.unidad) {
      alert('⚠️ Por favor selecciona un usuario válido.');
      return;
    }
    
    if (this.fechaInput) {
     const partes = this.fechaInput.split('-'); 
     console.log('📅 Fecha seleccionada:', this.fechaInput);
    this.reporte.fechaModificacion = new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2]),
      12, 0, 0 // hora fija: medio día para evitar desfases por zona horaria
      )};
   
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
  }}