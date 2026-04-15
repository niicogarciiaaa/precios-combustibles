import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { GasolinerasService } from './gasolineras.service';
import { Gasolinera } from '../models/gasolinera.model';

describe('GasolinerasService', () => {
  let service: GasolinerasService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [GasolinerasService]
    });
    service = TestBed.inject(GasolinerasService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('debería crearse correctamente', () => {
    expect(service).toBeTruthy();
  });

  // ─── parsearPrecio ──────────────────────────────────────────────────────────

  describe('parsearPrecio', () => {
    const parsear = (v: string) => (service as any).parsearPrecio(v);

    it('debería parsear precio con coma decimal', () => {
      expect(parsear('1,329')).toBe(1.329);
    });

    it('debería parsear precio con punto decimal', () => {
      expect(parsear('1.329')).toBe(1.329);
    });

    it('debería devolver undefined para cadena vacía', () => {
      expect(parsear('')).toBeUndefined();
    });

    it('debería devolver undefined para null/undefined', () => {
      expect(parsear(null as any)).toBeUndefined();
      expect(parsear(undefined as any)).toBeUndefined();
    });

    it('debería devolver undefined para cadena con solo espacios', () => {
      expect(parsear('   ')).toBeUndefined();
    });

    it('debería devolver undefined para texto no numérico', () => {
      expect(parsear('abc')).toBeUndefined();
    });

    it('debería parsear precios enteros', () => {
      expect(parsear('2')).toBe(2);
    });

    it('debería parsear precios con muchos decimales', () => {
      expect(parsear('1,23456')).toBeCloseTo(1.23456, 5);
    });
  });

  // ─── parsearCoordenada ──────────────────────────────────────────────────────

  describe('parsearCoordenada', () => {
    const parsear = (v: string) => (service as any).parsearCoordenada(v);

    it('debería parsear coordenada con coma', () => {
      expect(parsear('43,370894')).toBeCloseTo(43.370894, 5);
    });

    it('debería parsear coordenada con punto', () => {
      expect(parsear('43.370894')).toBeCloseTo(43.370894, 5);
    });

    it('debería devolver 0 para cadena vacía', () => {
      expect(parsear('')).toBe(0);
    });

    it('debería devolver 0 para null/undefined', () => {
      expect(parsear(null as any)).toBe(0);
      expect(parsear(undefined as any)).toBe(0);
    });

    it('debería manejar coordenadas negativas', () => {
      expect(parsear('-8,396280')).toBeCloseTo(-8.396280, 5);
    });
  });

  // ─── transformarDatos ──────────────────────────────────────────────────────

  describe('transformarDatos', () => {
    const transformar = (data: Gasolinera[]) => (service as any).transformarDatos(data);

    const gasolineraMock: Gasolinera = {
      'IDEESS': '1234',
      'Rótulo': 'REPSOL',
      'Dirección': 'Calle Falsa 123',
      'Localidad': 'A CORUÑA',
      'Provincia': 'A CORUÑA',
      'C.P.': '15001',
      'Latitud': '43,370894',
      'Longitud (WGS84)': '-8,396280',
      'Horario': 'L-D: 24H',
      'Precio Gasolina 95 E5': '1,529',
      'Precio Gasolina 98 E5': '1,699',
      'Precio Gasoleo A': '1,329',
      'Precio Gasoleo Premium': '1,459',
      'Precio Bioetanol': '',
      'Precio Biodiesel': '',
      'Precio Gas Natural Comprimido': '',
      'Precio Gas Natural Licuado': '',
      'Precio Gases licuados del petróleo': '0,779'
    };

    it('debería transformar un array de gasolineras', () => {
      const resultado = transformar([gasolineraMock]);
      expect(resultado.length).toBe(1);
    });

    it('debería mapear el ID correctamente', () => {
      const resultado = transformar([gasolineraMock]);
      expect(resultado[0].id).toBe('1234');
    });

    it('debería mapear el nombre del rótulo', () => {
      const resultado = transformar([gasolineraMock]);
      expect(resultado[0].nombre).toBe('REPSOL');
    });

    it('debería usar "Sin nombre" si el rótulo está vacío', () => {
      const sinNombre = { ...gasolineraMock, 'Rótulo': '' };
      const resultado = transformar([sinNombre]);
      expect(resultado[0].nombre).toBe('Sin nombre');
    });

    it('debería parsear latitud y longitud correctamente', () => {
      const resultado = transformar([gasolineraMock]);
      expect(resultado[0].latitud).toBeCloseTo(43.370894, 4);
      expect(resultado[0].longitud).toBeCloseTo(-8.396280, 4);
    });

    it('debería parsear precios con coma a números', () => {
      const resultado = transformar([gasolineraMock]);
      expect(resultado[0].precios.gasolina95).toBeCloseTo(1.529, 3);
      expect(resultado[0].precios.diesel).toBeCloseTo(1.329, 3);
      expect(resultado[0].precios.glp).toBeCloseTo(0.779, 3);
    });

    it('debería dejar undefined los precios vacíos', () => {
      const resultado = transformar([gasolineraMock]);
      expect(resultado[0].precios.bioetanol).toBeUndefined();
      expect(resultado[0].precios.biodiesel).toBeUndefined();
      expect(resultado[0].precios.gnc).toBeUndefined();
    });

    it('debería mapear dirección, localidad, provincia, CP y horario', () => {
      const resultado = transformar([gasolineraMock]);
      expect(resultado[0].direccion).toBe('Calle Falsa 123');
      expect(resultado[0].localidad).toBe('A CORUÑA');
      expect(resultado[0].provincia).toBe('A CORUÑA');
      expect(resultado[0].codigoPostal).toBe('15001');
      expect(resultado[0].horario).toBe('L-D: 24H');
    });

    it('debería manejar un array vacío', () => {
      const resultado = transformar([]);
      expect(resultado).toEqual([]);
    });
  });

  // ─── obtenerProvincias ──────────────────────────────────────────────────────

  describe('obtenerProvincias', () => {
    it('debería obtener y ordenar las provincias alfabéticamente', () => {
      const mockProvincias = [
        { IDPovincia: '33', Provincia: 'ASTURIAS', IDCCAA: '03', CCAA: 'Principado de Asturias' },
        { IDPovincia: '15', Provincia: 'A CORUÑA', IDCCAA: '12', CCAA: 'Galicia' },
        { IDPovincia: '28', Provincia: 'MADRID', IDCCAA: '13', CCAA: 'Comunidad de Madrid' }
      ];

      service.obtenerProvincias().subscribe(provincias => {
        expect(provincias.length).toBe(3);
        expect(provincias[0].Provincia).toBe('A CORUÑA');
        expect(provincias[1].Provincia).toBe('ASTURIAS');
        expect(provincias[2].Provincia).toBe('MADRID');
      });

      const req = httpMock.expectOne(
        'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/Listados/Provincias/'
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockProvincias);
    });

    it('debería cachear las provincias en llamadas sucesivas', () => {
      const mockProvincias = [
        { IDPovincia: '15', Provincia: 'A CORUÑA', IDCCAA: '12', CCAA: 'Galicia' }
      ];

      // Primera llamada
      service.obtenerProvincias().subscribe();
      const req = httpMock.expectOne(
        'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/Listados/Provincias/'
      );
      req.flush(mockProvincias);

      // Segunda llamada: no debería hacer otra petición HTTP
      service.obtenerProvincias().subscribe(provincias => {
        expect(provincias.length).toBe(1);
      });

      httpMock.expectNone(
        'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/Listados/Provincias/'
      );
    });
  });

  // ─── refrescar ──────────────────────────────────────────────────────────────

  describe('refrescar', () => {
    it('debería invalidar los caches', () => {
      // Acceder a propiedades privadas para verificar
      const s = service as any;

      // Simular que hay caches
      s.provincias$ = 'algo';
      s.gasolineras$ = 'algo';
      s.gasolinerasCompletas$ = 'algo';
      s.gasolinerasPorProvinciaCache.set('15', 'algo');

      service.refrescar();

      expect(s.provincias$).toBeNull();
      expect(s.gasolineras$).toBeNull();
      expect(s.gasolinerasCompletas$).toBeNull();
      expect(s.gasolinerasPorProvinciaCache.size).toBe(0);
    });
  });

  // ─── obtenerGasolinerasPorProvinciaId ────────────────────────────────────────

  describe('obtenerGasolinerasPorProvinciaId', () => {
    it('debería devolver array vacío para ID vacío', (done) => {
      service.obtenerGasolinerasPorProvinciaId('').subscribe(result => {
        expect(result).toEqual([]);
        done();
      });
    });

    it('debería devolver array vacío para ID con solo espacios', (done) => {
      service.obtenerGasolinerasPorProvinciaId('   ').subscribe(result => {
        expect(result).toEqual([]);
        done();
      });
    });
  });
});
