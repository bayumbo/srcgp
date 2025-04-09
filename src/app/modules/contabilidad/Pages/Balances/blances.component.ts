import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Timestamp } from 'firebase/firestore';
import { RouterModule } from '@angular/router';
import { jsPDF } from 'jspdf';
import { LibroMayorService } from '../../Services/comprobante.service';

@Component({
  selector: 'app-blances',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './blances.component.html',
  styleUrls: ['./blances.component.scss']
})

export class BalanceComponent implements OnInit {
  formFiltro!: FormGroup;
  datosBalance: any[] = [];
  cuentasUnicas: string[] = [];

  constructor(private fb: FormBuilder, private libroMayorService: LibroMayorService) {}

  ngOnInit(): void {
    this.formFiltro = this.fb.group({
      inicio: ['', Validators.required],
      fin: ['', Validators.required],
      
    });
    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.style.display = 'none';
      }
    }, 600);
  }

  async generarBalance(): Promise<void> {
    const { inicio, fin } = this.formFiltro.value;
    if (!inicio || !fin) {
      alert('⚠️ Debes seleccionar un rango de fechas.');
      return;
    }

    const datos = await this.libroMayorService.obtenerLibrosMayorPorFechas(inicio, fin);

    const agrupado: Record<string, any> = {};
    datos.forEach(item => {
      if (!agrupado[item.cuenta]) {
        agrupado[item.cuenta] = {
          cuenta: item.cuenta,
          nombre: item.descripcion || item.concepto,
          debe: 0,
          haber: 0,
          saldoDebe: 0,
          saldoHaber: 0
        };
      }

      agrupado[item.cuenta].debe += item.debe || 0;
      agrupado[item.cuenta].haber += item.haber || 0;
    });

    // Calcular saldos
    for (const cuenta in agrupado) {
      const grupo = agrupado[cuenta];
      const saldo = grupo.debe - grupo.haber;
      if (saldo > 0) grupo.saldoDebe = saldo;
      else grupo.saldoHaber = Math.abs(saldo);
    }

    this.datosBalance = Object.values(agrupado);
  }

  exportarPDF(): void {
    const doc = new jsPDF();
    let y = 20;

    doc.text('BALANCE DE COMPROBACIÓN', 105, y, { align: 'center' });
    y += 10;

    doc.setFontSize(10);
    doc.text('Cuenta     Nombre                           Debe     Haber     Saldo Debe     Saldo Haber', 10, y);
    y += 8;

    this.datosBalance.forEach(item => {
      doc.text(`${item.cuenta}  ${item.nombre?.substring(0, 25)}  ${item.debe.toFixed(2)}  ${item.haber.toFixed(2)}  ${item.saldoDebe.toFixed(2)}  ${item.saldoHaber.toFixed(2)}`, 10, y);
      y += 8;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`BalanceComprobacion_${new Date().toISOString().slice(0, 10)}.pdf`);
  }
  get totalDebe() {
    return this.datosBalance.reduce((sum, item) => sum + item.debe, 0);
  }
  get totalHaber() {
    return this.datosBalance.reduce((sum, item) => sum + item.haber, 0);
  }
  get totalDeudor() {
    return this.datosBalance.reduce((sum, item) => sum + item.saldoDebe, 0);
  }
  get totalAcreedor() {
    return this.datosBalance.reduce((sum, item) => sum + item.saldoHaber, 0);
  }
}
