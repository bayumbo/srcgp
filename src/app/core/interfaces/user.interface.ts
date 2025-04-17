export interface Credential {
  email: string;
  password: string;
}

export interface Usuario {
  uid: string;
  cedula: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: string;
  creadoEn?: any;
}

