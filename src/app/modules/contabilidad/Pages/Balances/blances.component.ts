import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { jsPDF } from 'jspdf';
import { LibroMayorService } from '../../Services/comprobante.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-blances',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule,MatIconModule, RouterModule],
  templateUrl: './blances.component.html',
  styleUrls: ['./blances.component.scss']
})

export class BalanceComponent implements OnInit {
  formFiltro!: FormGroup;
  datosBalance: any[] = [];


  constructor(
    private fb: FormBuilder,
    private libroMayorService: LibroMayorService
  ) {}

  ngOnInit(): void {
    this.formFiltro = this.fb.group({
      inicio: ['', Validators.required],
      fin: ['', Validators.required],
      tipoBalance: ['comprobacion', Validators.required] // nuevo campo para tipo
    });

    setTimeout(() => {
      const preloader = document.getElementById('preloader');
      if (preloader) {
        preloader.style.display = 'none';
      }
    }, 600);
  }
  menuAbierto: boolean = false;

  async generarBalance(): Promise<void> {
    const { inicio, fin, tipoBalance } = this.formFiltro.value;
    if (!inicio || !fin || !tipoBalance) {
      alert('⚠️ Debes completar todos los campos.');
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

    for (const cuenta in agrupado) {
      const grupo = agrupado[cuenta];
      const saldo = grupo.debe - grupo.haber;

      if (tipoBalance === 'comprobacion') {
        if (saldo > 0) grupo.saldoDebe = saldo;
        else grupo.saldoHaber = Math.abs(saldo);
      } else if (tipoBalance === 'general') {
        grupo.saldoDebe = saldo >= 0 ? saldo : 0;
        grupo.saldoHaber = saldo < 0 ? Math.abs(saldo) : 0;
      }
    }

    this.datosBalance = Object.values(agrupado);
  }

  exportarPDF(): void {
    const { tipoBalance } = this.formFiltro.value;
    const doc = new jsPDF();
    let y = 20;

    const titulo = tipoBalance === 'general' ? 'BALANCE GENERAL' : 'BALANCE DE COMPROBACIÓN';
    doc.setFontSize(12);
    doc.text(titulo + ' AL ' + new Date().toISOString().slice(0, 10), 105, y, { align: 'center' });
    y += 10;

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'bold');
    doc.setFillColor(200,200,200);
    doc.rect(10, y, 190, 8, 'F');
    doc.text('CÓDIGO', 12, y + 6);
    doc.text('CUENTA', 35, y + 6);
    doc.text('SUMAS', 105, y + 4);
    doc.text('SALDOS', 150, y + 4);

    y += 8;
    doc.setFont('Helvetica', 'normal');
    doc.text('DEBE', 95, y);
    doc.text('HABER', 115, y);
    doc.text('DEBE', 140, y);
    doc.text('HABER', 165, y);
    y += 6;

    this.datosBalance.forEach(item => {
      doc.text(item.cuenta, 12, y);
      doc.text(item.nombre?.substring(0, 35), 35, y);
      doc.text(item.debe.toFixed(2), 95, y, { align: 'right' });
      doc.text(item.haber.toFixed(2), 115, y, { align: 'right' });
      doc.text(item.saldoDebe.toFixed(2), 140, y, { align: 'right' });
      doc.text(item.saldoHaber.toFixed(2), 165, y, { align: 'right' });
      y += 7;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.setFont('Helvetica', 'bold');
    doc.text('SUMAN:', 35, y);
    doc.text(this.totalDebe.toFixed(2), 95, y, { align: 'right' });
    doc.text(this.totalHaber.toFixed(2), 115, y, { align: 'right' });
    doc.text(this.totalDeudor.toFixed(2), 140, y, { align: 'right' });
    doc.text(this.totalAcreedor.toFixed(2), 165, y, { align: 'right' });


    const nombreArchivo = tipoBalance === 'general' ? 'BalanceGeneral' : 'BalanceComprobacion';
    doc.save(`${nombreArchivo}_${new Date().toISOString().slice(0, 10)}.pdf`);
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
