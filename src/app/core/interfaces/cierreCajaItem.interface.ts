export interface CierreCajaItem {
    empresa: string;
    modulo: string;       
    unidad: string;       
    fecha: Date;          
    valor: number;       
    pdfUrl?: string;      
  }
  
export interface Egreso {
modulo: string;
valor: number;
}