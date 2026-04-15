import { PreciosPipe } from './precios.pipe';

describe('PreciosPipe', () => {
  let pipe: PreciosPipe;

  beforeEach(() => {
    pipe = new PreciosPipe();
  });

  it('debería crearse correctamente', () => {
    expect(pipe).toBeTruthy();
  });

  it('debería formatear un precio con 3 decimales', () => {
    expect(pipe.transform(1.329)).toBe('1.329');
  });

  it('debería formatear un precio entero a 3 decimales', () => {
    expect(pipe.transform(2)).toBe('2.000');
  });

  it('debería formatear un precio con 1 decimal a 3 decimales', () => {
    expect(pipe.transform(1.5)).toBe('1.500');
  });

  it('debería formatear un precio con muchos decimales a solo 3', () => {
    expect(pipe.transform(1.23456)).toBe('1.235');
  });

  it('debería devolver "N/D" para undefined', () => {
    expect(pipe.transform(undefined)).toBe('N/D');
  });

  it('debería devolver "N/D" para null', () => {
    expect(pipe.transform(null as any)).toBe('N/D');
  });

  it('debería formatear 0 correctamente', () => {
    expect(pipe.transform(0)).toBe('0.000');
  });

  it('debería formatear precios menores que 1', () => {
    expect(pipe.transform(0.779)).toBe('0.779');
  });

  it('debería formatear precios mayores que 2', () => {
    expect(pipe.transform(2.159)).toBe('2.159');
  });
});
