
import { Component, OnInit } from '@angular/core';
import { CommonModule,} from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Timestamp } from 'firebase/firestore';
import { LibroDiarioService } from '../../Services/comprobante.service';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { RouterModule } from '@angular/router';


@Component({
  selector: 'app-libdiario',
  standalone: true,
  templateUrl: './libdiario.component.html',
  styleUrls: ['./libdiario.component.scss'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule,RouterModule],
})

export class LibroDiarioComponent implements OnInit {
  formAsiento!: FormGroup;
  asientosFiltrados: any[] = [];
  filtroInicio: string = '';
  filtroFin: string = '';

 // 👇 Lógica para el submenú

  constructor(
    private fb: FormBuilder,
    private diarioService: LibroDiarioService
  ) {}
  ngOnInit(): void {
    this.formAsiento = this.fb.group({
      numero: [{ value: this.generarCodigoAsiento(), disabled: true }],
      fecha: ['', Validators.required],
      concepto: ['', Validators.required],
      detalles: this.fb.array([])
      
    });
    this.agregarDetalle();
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.style.display = 'none';
      }
    }, 600);
  }
 
  get detalles(): FormArray {
    return this.formAsiento.get('detalles') as FormArray;
  }

  agregarDetalle(): void {
    const grupo = this.fb.group({
      cuenta: ['', Validators.required],
      descripcion: ['', Validators.required],
      centroCostos: ['', Validators.required],
      debe: ['',Validators.required],
      haber: ['',Validators.required]
    });
    this.detalles.push(grupo);
  }

  eliminarDetalle(index: number): void {
    this.detalles.removeAt(index);
  }

  async guardarAsiento(): Promise<void> {
    if (this.formAsiento.invalid || this.detalles.length === 0) {
      // 🔁 Marcar todos los campos del formulario y del array como tocados
      this.formAsiento.markAllAsTouched();
  
      this.detalles.controls.forEach(control => {
        control.markAllAsTouched(); // 👈 Esto es lo que faltaba
      });
  
      alert('⚠️ Debes completar todos los campos obligatorios antes de generar el PDF.');
      return;
    }
    const raw = this.formAsiento.getRawValue();
    const asiento = {
      numero: raw.numero,
      fecha: raw.fecha,
      concepto: raw.concepto,
      detalles: raw.detalles
    };

    const doc = new jsPDF();
    let y = 20;

    doc.text(`Numero: ${asiento.numero}`, 15, y);
    y += 10;
    doc.text(`Fecha: ${asiento.fecha}`, 15, y);
    y += 10;
    doc.text(`Concepto: ${asiento.concepto}`, 15, y);
    y += 10;

    doc.setFont('Helvetica', 'bold');
    doc.text('CUENTA     DESCRIPCION     C. COSTOS     DEBITO     CREDITO', 15, y);
    doc.setFont('Helvetica', 'normal');
    y += 10;

    asiento.detalles.forEach((item: any) => {
      doc.text(
        `${item.cuenta}  ${item.descripcion}  ${item.centroCostos || '-'}  ${item.debe.toFixed(2)}  ${item.haber.toFixed(2)}`,
        15,
        y
      );
      y += 8;
    });

    const blob = doc.output('blob');
    doc.save(`${asiento.numero}.pdf`);
    const url = await this.diarioService.guardarAsientoConPDF(asiento, blob);

    alert('✅ Asiento guardado y PDF generado.');
  
    this.formAsiento.reset();
    this.detalles.clear();
    this.agregarDetalle();
    this.formAsiento.patchValue({ numero: this.generarCodigoAsiento() });
  }

  async filtrarPorFechas(): Promise<void> {
    if (this.filtroInicio && this.filtroFin) {
      this.asientosFiltrados = await this.diarioService.obtenerAsientosPorFechas(
        this.filtroInicio,
        this.filtroFin
      );
    }
  }

  generarCodigoAsiento(): string {
    const now = Date.now();
    return 'COM' + String(now).slice(-8);
  }


  async eliminarAsiento(id: string, numero: string): Promise<void> {
    if (confirm('¿Estás seguro de eliminar este asiento? Esta acción no se puede deshacer.')) {
      try {
        await this.diarioService.eliminarAsientoPorId(id, numero);
        this.asientosFiltrados = this.asientosFiltrados.filter(a => a.id !== id);
        alert('✅ Asiento eliminado correctamente.');
      } catch (error) {
        console.error('❌ Error al eliminar el asiento:', error);
        alert('❌ Ocurrió un error al eliminar el asiento.');
      }
    }
  }
 
}


export interface AsientoContable {
  numero: string;
  concepto: string;
  fecha: string;
  detalles: {
    cuenta: string;
    descripcion: string;
    centroCostos: string;
    debe: number;
    haber: number;
  }[];
}

