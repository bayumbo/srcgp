import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FirebaseService } from '../../Services/comprobante.service';
import { jsPDF } from 'jspdf';
import { RouterModule } from '@angular/router';

interface Transaccion {
  descripcion: string;
  codigo: string;
  fecha: string;
  tipo: string;
  monto: number;
  debe: number;
  haber: number;
}

@Component({
  selector: 'app-indexconta',
  standalone: true,
  templateUrl: './indexconta.component.html',
  styleUrls: ['./stylescontacom.scss'],
  imports: [CommonModule, ReactiveFormsModule,RouterModule]
})

export class IndexContaComponent implements OnInit {
  egresoForm!: FormGroup;
  transacciones: Transaccion[] = [];
  comprobantes: any[] = [];
  totalDebe = 0;
  totalHaber = 0;

  constructor(private fb: FormBuilder, private firebaseService: FirebaseService) {}

  ngOnInit() {
    this.initFormulario();
    this.mostrarPDFs();

    // Ocultar preloader tras 600ms
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.style.display = 'none';
      }
    }, 600);
  }

  initFormulario(): void {
    this.egresoForm = this.fb.group({
      beneficiario: ['', Validators.required],
      cedula: ['', [Validators.required, Validators.maxLength(13)]],
      codigo: ['', Validators.required],
      fecha: ['', Validators.required],
      descripcion: ['', Validators.required],
      tipo: ['Debe'],
      monto: ['', Validators.required],
      numeroCheque: [''],
    });
  }

  agregarTransaccion(): void {
    if (this.egresoForm.invalid) return;

    const { codigo, fecha, descripcion, tipo, monto } = this.egresoForm.value;
    const montoNum = parseFloat(monto);
    const nueva: Transaccion = {
      codigo,
      fecha,
      descripcion,
      tipo,
      monto: montoNum,
      debe: tipo === 'Debe' ? montoNum : 0,
      haber: tipo === 'Haber' ? montoNum : 0,
    };

    this.transacciones.push(nueva);
    this.actualizarTotales();
    this.egresoForm.patchValue({ descripcion: '', monto: '' });
  }

  eliminarTransaccion(index: number): void {
    this.transacciones.splice(index, 1);
    this.actualizarTotales();
  }

  actualizarTotales(): void {
    this.totalDebe = this.transacciones.reduce((sum, t) => sum + t.debe, 0);
    this.totalHaber = this.transacciones.reduce((sum, t) => sum + t.haber, 0);
  }

  async generarPDF(): Promise<void> {
    const doc = new jsPDF();
    const id = 'CE-' + String(Date.now()).slice(-6);
    const { beneficiario, cedula, fecha, numeroCheque } = this.egresoForm.value;

    let y = 20;
    doc.text('Comprobante de Egreso', 105, y, { align: 'center' });
    y += 10;
    doc.text(`No: ${id}`, 15, y);
    doc.text(`Fecha: ${fecha}`, 140, y);
    y += 10;
    doc.text(`Beneficiario: ${beneficiario}`, 15, y);
    y += 10;
    doc.text(`Cédula/RUC: ${cedula}`, 15, y);
    y += 10;
if (numeroCheque) {
  doc.text(`Cheque: ${numeroCheque}`, 15, y);
  y += 10;
}

    y += 10;
    doc.text('Descripción', 15, y);
    doc.text('Debe', 120, y);
    doc.text('Haber', 160, y);
    y += 10;

    this.transacciones.forEach((item) => {
      doc.text(item.descripcion, 15, y);
      doc.text(item.debe.toFixed(2), 120, y);
      doc.text(item.haber.toFixed(2), 160, y);
      y += 8;
    });

    y += 10;
    doc.text(`Total Debe: $${this.totalDebe.toFixed(2)}`, 120, y);
    y += 6;
    doc.text(`Total Haber: $${this.totalHaber.toFixed(2)}`, 120, y);

    const pdfBlob = doc.output('blob');
    await this.firebaseService.guardarComprobante({
      comprobanteId: id,
      beneficiario,
      cedula,
      fecha,
      totalDebe: this.totalDebe,
      totalHaber: this.totalHaber,
      numeroCheque, // ✅ lo guardamos también
      transacciones: this.transacciones
    }, pdfBlob);

    doc.save(`${id}.pdf`);
    alert('✅ Comprobante guardado y PDF generado.');
    this.transacciones = [];
    this.actualizarTotales();
    this.mostrarPDFs();
  }

  async mostrarPDFs(): Promise<void> {
    this.comprobantes = await this.firebaseService.obtenerComprobantes();
  }

  eliminarComprobante(id: string, comprobanteId: string): void {
    this.firebaseService.eliminarComprobantePorId(id, comprobanteId)
      .then(() => {
        this.comprobantes = this.comprobantes.filter(c => c.id !== id);
        alert('✅ Comprobante eliminado correctamente.');
      })
      .catch(err => {
        console.error('❌ Error al eliminar:', err);
        alert('Error al eliminar comprobante.');
      });
  }
}