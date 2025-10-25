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
  updateDoc,
  setDoc,
  serverTimestamp
} from '@angular/fire/firestore';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NuevoRegistro } from 'src/app/core/interfaces/reportes.interface';
import { PagoPorModulo } from 'src/app/core/interfaces/pagoPorModulo.interface';
import { DocumentoPago } from 'src/app/core/interfaces/documentoPago.interface';
import { ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Storage } from '@angular/fire/storage';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';



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
  private storage = inject(Storage);

  uidUsuario: string = '';
  reporteId: string = '';
  registros: NuevoRegistro | null = null;

  pagosTotales: Record<CampoClave, PagoPorModulo[]> = {
    minutosAtraso: [],
    administracion: [],
    minutosBase: [],
    multas: []
  };

  pagosActuales: Record<string, Partial<Record<CampoClave, number>>> = {};
  fechasPagosActuales: Record<string, Partial<Record<CampoClave, string>>> = {};
  campos: CampoClave[] = ['minutosAtraso', 'administracion', 'minutosBase', 'multas'];
  pagoEnEdicion: { id: string; campo: CampoClave } | null = null;
  nuevoMonto: number | null = null;
  fechaEnEdicion: string | null = null;

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

    this.registros = {
      ...(snap.data() as NuevoRegistro),
      id: snap.id
    };

    // ✅ AÑADE ESTE CÓDIGO para inicializar los objetos
    // Esto previene que el HTML intente acceder a propiedades de un objeto 'undefined'
    if (this.registros.id) {
      this.pagosActuales[this.registros.id] = {};
      this.fechasPagosActuales[this.registros.id] = {};
    }

    this.pagosTotales = {
      minutosAtraso: [],
      administracion: [],
      minutosBase: [],
      multas: []
    };

    await this.cargarPagosTotales();
    
    if (this.registros?.id) {
  for (const campo of this.campos) {
    if (!this.fechasPagosActuales[this.registros.id][campo]) {
      this.fechasPagosActuales[this.registros.id][campo] = this.obtenerFechaActual();
    }
  }
}
  }  

  obtenerFechaActual(): string {
  const hoy = new Date();
  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, '0');
  const day = String(hoy.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
async cargarPagosTotales() {
  // Limpia el estado de pagos anteriores
  for (const campo of this.campos) {
    this.pagosTotales[campo as CampoClave] = [];
  }

  // ✅ Usamos la variable 'registros' directamente
  if (this.registros) {
    const reporteId = this.registros.id!;
    const ref = collection(
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
            ? [{ id: p.id, cantidad: cantidad, fecha: p.fecha, reporteId }]
            : [];
        });

      this.pagosTotales[campo as CampoClave].push(...nuevosPagos);
    }
  }

  console.log('💰 Pagos cargados:', this.pagosTotales);
}
  cargandoPago: boolean = false;
  fechaSeleccionada: Date = new Date();

  async guardarPagosGenerales() {
  if (this.cargandoPago) return;
  this.cargandoPago = true;

  try {
    if (this.registros) {
      const registro = this.registros;
      const detalles: Partial<Record<CampoClave, number>> = {};
      const pagosConFechas: { campo: CampoClave; monto: number; fecha: Timestamp }[] = [];
      let tienePago = false;
      let total = 0;

      for (const campo of this.campos) {
        const monto = this.pagosActuales[registro.id!]?.[campo] ?? 0;
        if (monto > 0) {
          tienePago = true;
          detalles[campo] = monto;
          total += monto;

          const fechaPagoRegistro = this.fechasPagosActuales[registro.id!]?.[campo];
          if (!fechaPagoRegistro) continue;

          const [year, month, day] = fechaPagoRegistro.split('-').map(Number);
          const fecha = Timestamp.fromDate(new Date(year, month - 1, day));
          pagosConFechas.push({ campo, monto, fecha });
        }
      }

      if (tienePago && pagosConFechas.length > 0) {
        const ref = collection(
          this.firestore,
          `usuarios/${this.uidUsuario}/reportesDiarios/${registro.id}/pagosTotales`
        );

        // 1️⃣ Guardar inmediatamente el pago (sin PDF aún)
        const docRef = await addDoc(ref, {
          fecha: pagosConFechas[0].fecha,
          detalles,
          total,
          urlPDF: null,
          fechasPorModulo: pagosConFechas.reduce((acc, p) => ({ ...acc, [p.campo]: p.fecha }), {})
        });
        

        // 2️⃣ Liberar el botón y navegar ya
        alert('✅ Pago registrado correctamente. Generando recibo en segundo plano...');
        this.router.navigate(['/reportes/lista-reportes']);
        this.cargandoPago = false;

        // 3️⃣ Generar PDF en segundo plano
        this.generarReciboYSubirPDF(this.uidUsuario, registro.id!, {
          nombre: registro.nombre,
          apellido: registro.apellido,
          unidad: registro.unidad,
          total,
          detalles,
          pagosConFechas
        })
        .then(async (urlPDF) => {
          // Actualiza el documento con el link del PDF
          await updateDoc(doc(this.firestore, ref.path, docRef.id), { urlPDF });
          console.log('📄 Recibo PDF generado y URL actualizada');
        })
        .catch(err => {
          console.error('❌ Error generando el PDF:', err);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error al guardar los pagos:', error);
    alert('Ocurrió un error al guardar los pagos.');
  } finally {
    this.cargandoPago = false;
  }
}

  /*---------------------------------- Lógica generar recibo y formato----------------------*/
  
  async generarReciboYSubirPDF(
    uid: string,
    reporteId: string,
    datos: {
      nombre: string;
      apellido: string;
      unidad: string;
      total: number;
      detalles: Partial<Record<CampoClave, number>>;
      // ✅ EL PARÁMETRO AHORA ES UN ARRAY DE PAGOS, CADA UNO CON SU FECHA.
      pagosConFechas: { campo: CampoClave; monto: number; fecha: Timestamp }[];
    }
    
  ): Promise<string> {

    // ✅ Usamos la fecha del primer pago del array como la fecha de emisión del recibo
    const fechaActual = datos.pagosConFechas[0]?.fecha.toDate() || new Date();
    const fechaTexto = fechaActual.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const horaTexto = fechaActual.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const campos: CampoClave[] = ['administracion', 'minutosBase', 'minutosAtraso', 'multas'];

    const pendientes: Record<CampoClave, number> = {
      administracion: 0,
      minutosBase: 0,
      minutosAtraso: 0,
      multas: 0
    };

    const registro = this.registros; // Ya tienes el objeto 'registro' aquí
    if (!registro) throw new Error('Registro no encontrado en memoria');
          
    for (const campo of campos) {
      const totalCampo = registro[campo] ?? 0;
      const pagadoAnterior = this.calcularTotalPagado(campo, reporteId);
      const pagadoNuevo = datos.detalles?.[campo] ?? 0;

      pendientes[campo] = Math.max(totalCampo - (pagadoAnterior + pagadoNuevo), 0);
    }

    // ✅ Creamos la tabla del pago actual iterando sobre el array 'pagosConFechas'
    const tablaPagoActual = [];
    for (const pago of datos.pagosConFechas) {
      const fechaDelPago = pago.fecha.toDate().toLocaleDateString('es-EC', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      const descripcion = 
        pago.campo === 'administracion' ? 'Administración' :
        pago.campo === 'minutosBase' ? 'Minutos Base' :
        pago.campo === 'minutosAtraso' ? 'Minutos Atraso' :
        'Multas';
      
      tablaPagoActual.push([
        descripcion,
        fechaDelPago,
        `$${pago.monto.toFixed(2)}`
      ]);
    }
    tablaPagoActual.push(['TOTAL', '', `$${datos.total.toFixed(2)}`]);

    // Cargar logos
    const logoPintag = await this.cargarImagenBase64('/assets/img/LogoPintag.png');
    const logoExpress = await this.cargarImagenBase64('/assets/img/LogoAntisana.png');

    const pdfDoc = new jsPDF();

    // 🖼 Logos
    pdfDoc.addImage(logoPintag, 'PNG', 10, 10, 30, 30);
    pdfDoc.addImage(logoExpress, 'PNG', 170, 10, 30, 30);

    // 🧾 Encabezado
    pdfDoc.setFontSize(18);
    pdfDoc.text('Consorcio Pintag Expresso', 60, 20);
    pdfDoc.setFontSize(10);
    pdfDoc.text('Pintag, Antisana S2-138', 80, 26);
    pdfDoc.text('consorciopinxpres@hotmail.com', 70, 31);
    pdfDoc.text(``, 20, 45);
    // 🚍 Datos principales
    pdfDoc.setFontSize(18);
    pdfDoc.text(`BUS ${datos.unidad}`, 20, 45);
    
    pdfDoc.setFontSize(11);
    pdfDoc.text(`Fecha de emisión: ${fechaTexto}`, 130, 45);
    pdfDoc.text(`Hora de emisión: ${horaTexto}`, 130, 51);

    // 🧾 Tabla de pagos realizados
    autoTable(pdfDoc, {
      startY: 60,
      head: [['Descripción', 'Fecha', 'Valor']],
      // ✅ Usamos el array tablaPagoActual que ahora contiene las fechas individuales
      body: tablaPagoActual,
      styles: { fontSize: 11, halign: 'right' },
      headStyles: { fillColor: [30, 144, 255], halign: 'center' }
    });

    const yFinal = (pdfDoc as any).lastAutoTable?.finalY || 100;

    // 📊 Tabla de valores pendientes
    autoTable(pdfDoc, {
      startY: yFinal + 15,
      head: [['Descripción', 'Pendiente']],
      body: [
        ['Administración', `$${pendientes.administracion.toFixed(2)}`],
        ['Minutos Base', `$${pendientes.minutosBase.toFixed(2)}`],
        ['Minutos Atraso', `$${pendientes.minutosAtraso.toFixed(2)}`],
        ['Multas', `$${pendientes.multas.toFixed(2)}`]
      ],
      styles: { fontSize: 11, halign: 'right', textColor: 'black' },
      headStyles: { halign: 'center', fillColor: [240, 240, 240] }
    });

    const yFinal2 = (pdfDoc as any).lastAutoTable?.finalY || yFinal + 40;

    // 🚌 Imagen del bus con proporción original y centrado
    const busImage = await this.cargarImagenBase64('/assets/img/Bus.png');
    const busImg = new Image();
    busImg.src = busImage;
    await new Promise(resolve => (busImg.onload = resolve));
    const originalWidth = busImg.width;
    const originalHeight = busImg.height;
    const displayWidth = 30;
    const displayHeight = (originalHeight / originalWidth) * displayWidth;
    const centerX = (210 - displayWidth) / 2;
    pdfDoc.addImage(busImage, 'PNG', centerX, yFinal2 + 10, displayWidth, displayHeight);

    // 📄 Texto de QR centrado
    const texto = 'Escanea el código para descargar tu recibo';
    pdfDoc.setFontSize(10);
    pdfDoc.setTextColor(0);
    const textWidth = pdfDoc.getTextWidth(texto);
    pdfDoc.text(texto, (210 - textWidth) / 2, yFinal2 + displayHeight + 25);

    // 🔳 Código QR centrado
    const pdfBlob = pdfDoc.output('blob');
    const fileName = `recibos/${uid}_${reporteId}_${Date.now()}.pdf`;
    const storageRef = ref(this.storage, fileName);
    await uploadBytes(storageRef, pdfBlob);
    const pdfUrl = await getDownloadURL(storageRef);
    const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(pdfUrl)}`;
    const qrBase64 = await this.cargarImagenBase64(qrURL);
    const qrSize = 30;
    pdfDoc.addImage(qrBase64, 'PNG', (210 - qrSize) / 2, yFinal2 + displayHeight + 30, qrSize, qrSize);

    // 💾 Guardar localmente
        
    setTimeout(() => {
      pdfDoc.save(`${fechaTexto}_
      ${datos.unidad.replace(/\s+/g, '_')}_
      ${datos.nombre.replace(/\s+/g, '_')}_
      ${datos.apellido.replace(/\s+/g, '_')}.pdf`);
    }, 500); // medio segundo después, opcional

    return pdfUrl;
  }
  
  cargarImagenBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = url;
  
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        resolve(dataURL);
      };
  
      img.onerror = (err) => reject(err);
    });
  }
  
  /*-------------------------------Fin recibo pdf----------------------------*/


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
    
    // ✅ Verifica si el objeto existe antes de continuar
    if (this.registros) {
      const registro = this.registros; // ✅ Usa una variable para mayor claridad
      for (const campo of this.campos) {
        const deuda = this.calcularDeuda(registro, campo);
        const actual = this.pagosActuales[registro.id!]?.[campo] ?? 0;
        total += Math.min(deuda, actual);
      }
    }

    return total;
  }

  validarPago(reporteId: string, campo: CampoClave) {
    // ✅ Verifica si el objeto existe
    if (this.registros) {
      const registro = this.registros; // ✅ Usamos el objeto directamente
      
      // ✅ Aquí ya no necesitas buscar el registro, ya lo tienes.
      // Solo debes validar que el id que recibes sea el mismo.
      if (registro.id === reporteId) {
        const deuda = this.calcularDeuda(registro, campo);
        const actual = this.pagosActuales[reporteId]?.[campo] ?? 0;
        if (actual > deuda) {
          this.pagosActuales[reporteId][campo] = deuda;
        }
      }
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
    const fecha = pago.fecha.toDate();
    this.fechaEnEdicion = fecha.toISOString().substring(0, 10);
  }
  

  async guardarEdicion() {
    if (this.pagoEnEdicion && this.nuevoMonto != null && this.nuevoMonto >= 0) {
      const { id, campo } = this.pagoEnEdicion;
      const pago = this.campos
        .flatMap(c => this.pagosTotales[c])
        .find(p => p.id === id);

      if (!pago) return;

      const ref = doc(this.firestore, `usuarios/${this.uidUsuario}/reportesDiarios/${pago.reporteId}/pagosTotales/${pago.id}`);
      
      const updateData: any = {
        [`detalles.${campo}`]: this.nuevoMonto
      };

      if (this.fechaEnEdicion) {
        const [year, month, day] = this.fechaEnEdicion.split('-').map(Number);
        const nuevaFecha = new Date(year, month - 1, day);
        updateData.fecha = Timestamp.fromDate(nuevaFecha);
      }
      
      await updateDoc(ref, updateData);

      alert('✅ Pago actualizado');
      await this.cargarPagosTotales();

      // Limpieza
      this.pagoEnEdicion = null;
      this.nuevoMonto = null;
      this.fechaEnEdicion = null;
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