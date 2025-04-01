import { Component, OnInit } from '@angular/core';
import { RecaudacionService } from '../../services/recaudacion.service';

@Component({
  selector: 'app-lista-pagos',
  templateUrl: './lista_pagos.component.html',
  styleUrls: ['./lista_pagos.component.scss']
})
export class ListaPagosComponent implements OnInit {
  pagos: any[] = [];

  constructor(private recaudacionService: RecaudacionService) {}

  ngOnInit() {
    this.recaudacionService.obtenerPagos().then(data => {
      this.pagos = data;
    });
  }
}