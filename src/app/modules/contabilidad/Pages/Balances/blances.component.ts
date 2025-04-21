import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LibroMayorService } from '../../Services/comprobante.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-blances',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, RouterModule],
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
      tipoBalance: ['comprobacion', Validators.required]
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
    const titulo = tipoBalance === 'general' ? 'BALANCE GENERAL' : 'BALANCE DE COMPROBACIÓN';
    const fecha = new Date().toISOString().slice(0, 10);

    doc.setFontSize(12);
    doc.setFont('Helvetica', 'bold');
    doc.text(`${titulo} AL ${fecha}`, 105, 20, { align: 'center' });

    autoTable(doc, {
      startY: 30,
      head: [
        [
          { content: 'CÓDIGO', rowSpan: 2 },
          { content: 'CUENTA', rowSpan: 2 },
          { content: 'SUMAS', colSpan: 2, styles: { halign: 'center' } },
          { content: 'SALDOS', colSpan: 2, styles: { halign: 'center' } }
        ],
        ['DEBE', 'HABER', 'DEUDOR', 'ACREEDOR']
      ],
      body: this.datosBalance.map(item => [
        item.cuenta,
        item.nombre,
        item.debe.toFixed(2),
        item.haber.toFixed(2),
        item.saldoDebe.toFixed(2),
        item.saldoHaber.toFixed(2)
      ]),
      foot: [[
        { content: 'SUMAN:', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: this.totalDebe.toFixed(2), styles: { fontStyle: 'bold' } },
        { content: this.totalHaber.toFixed(2), styles: { fontStyle: 'bold' } },
        { content: this.totalDeudor.toFixed(2), styles: { fontStyle: 'bold' } },
        { content: this.totalAcreedor.toFixed(2), styles: { fontStyle: 'bold' } }
      ]],
      styles: {
        halign: 'center',
        fontSize: 9,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [180, 180, 180],
        textColor: 20,
        fontStyle: 'bold'
      }
    });

    const nombreArchivo = tipoBalance === 'general' ? 'BalanceGeneral' : 'BalanceComprobacion';
    doc.save(`${nombreArchivo}_${fecha}.pdf`);
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
