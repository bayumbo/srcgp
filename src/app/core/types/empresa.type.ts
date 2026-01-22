export type Empresa = 'General Pintag' | 'Expreso Antisana';

export const EMPRESAS: Empresa[] = ['General Pintag', 'Expreso Antisana'];

export const EMPRESA_SLUG: Record<Empresa, string> = {
  'General Pintag': 'GeneralPintag',
  'Expreso Antisana': 'ExpresoAntisana',
};
