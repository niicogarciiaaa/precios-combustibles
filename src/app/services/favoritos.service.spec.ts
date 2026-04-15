import { TestBed } from '@angular/core/testing';
import { FavoritosService } from './favoritos.service';
import { GasolineraSimplificada } from '../models/gasolinera.model';

describe('FavoritosService', () => {
  let service: FavoritosService;

  const gasolineraMock: GasolineraSimplificada = {
    id: '1001',
    nombre: 'REPSOL',
    direccion: 'Calle Falsa 123',
    localidad: 'A CORUÑA',
    provincia: 'A CORUÑA',
    codigoPostal: '15001',
    horario: 'L-D: 24H',
    latitud: 43.370894,
    longitud: -8.396280,
    precios: {
      gasolina95: 1.529,
      diesel: 1.329
    }
  };

  const gasolineraMock2: GasolineraSimplificada = {
    id: '1002',
    nombre: 'CEPSA',
    direccion: 'Av. de la Marina 10',
    localidad: 'A CORUÑA',
    provincia: 'A CORUÑA',
    codigoPostal: '15002',
    horario: 'L-D: 24H',
    latitud: 43.365,
    longitud: -8.410,
    precios: {
      gasolina95: 1.539,
      diesel: 1.339
    }
  };

  beforeEach(() => {
    // Limpiar localStorage antes de cada test
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [FavoritosService]
    });
    service = TestBed.inject(FavoritosService);
  });

  it('debería crearse correctamente', () => {
    expect(service).toBeTruthy();
  });

  // ─── Estado inicial ──────────────────────────────────────────────────────

  describe('estado inicial', () => {
    it('debería empezar sin favoritos', () => {
      expect(service.getFavoritosActuales()).toEqual([]);
    });

    it('debería emitir array vacío en el observable', (done) => {
      service.getFavoritos().subscribe(favoritos => {
        expect(favoritos).toEqual([]);
        done();
      });
    });
  });

  // ─── agregarFavorito ──────────────────────────────────────────────────────

  describe('agregarFavorito', () => {
    it('debería agregar una gasolinera a favoritos', () => {
      service.agregarFavorito(gasolineraMock);
      expect(service.getFavoritosActuales().length).toBe(1);
      expect(service.getFavoritosActuales()[0].id).toBe('1001');
    });

    it('no debería agregar duplicados', () => {
      service.agregarFavorito(gasolineraMock);
      service.agregarFavorito(gasolineraMock);
      expect(service.getFavoritosActuales().length).toBe(1);
    });

    it('debería agregar múltiples gasolineras distintas', () => {
      service.agregarFavorito(gasolineraMock);
      service.agregarFavorito(gasolineraMock2);
      expect(service.getFavoritosActuales().length).toBe(2);
    });

    it('debería persistir en localStorage', () => {
      service.agregarFavorito(gasolineraMock);
      const stored = JSON.parse(localStorage.getItem('gasolineras_favoritos') || '[]');
      expect(stored.length).toBe(1);
      expect(stored[0].id).toBe('1001');
    });
  });

  // ─── eliminarFavorito ──────────────────────────────────────────────────────

  describe('eliminarFavorito', () => {
    it('debería eliminar una gasolinera por ID', () => {
      service.agregarFavorito(gasolineraMock);
      service.agregarFavorito(gasolineraMock2);
      service.eliminarFavorito('1001');
      expect(service.getFavoritosActuales().length).toBe(1);
      expect(service.getFavoritosActuales()[0].id).toBe('1002');
    });

    it('no debería fallar al eliminar un ID inexistente', () => {
      service.agregarFavorito(gasolineraMock);
      service.eliminarFavorito('9999');
      expect(service.getFavoritosActuales().length).toBe(1);
    });

    it('debería actualizar localStorage al eliminar', () => {
      service.agregarFavorito(gasolineraMock);
      service.eliminarFavorito('1001');
      const stored = JSON.parse(localStorage.getItem('gasolineras_favoritos') || '[]');
      expect(stored.length).toBe(0);
    });
  });

  // ─── esFavorito ──────────────────────────────────────────────────────────

  describe('esFavorito', () => {
    it('debería devolver true si la gasolinera está en favoritos', () => {
      service.agregarFavorito(gasolineraMock);
      expect(service.esFavorito('1001')).toBeTrue();
    });

    it('debería devolver false si no está en favoritos', () => {
      expect(service.esFavorito('1001')).toBeFalse();
    });
  });

  // ─── toggleFavorito ──────────────────────────────────────────────────────

  describe('toggleFavorito', () => {
    it('debería agregar si no está en favoritos', () => {
      service.toggleFavorito(gasolineraMock);
      expect(service.esFavorito('1001')).toBeTrue();
    });

    it('debería eliminar si ya está en favoritos', () => {
      service.agregarFavorito(gasolineraMock);
      service.toggleFavorito(gasolineraMock);
      expect(service.esFavorito('1001')).toBeFalse();
    });

    it('debería alternar correctamente en múltiples llamadas', () => {
      service.toggleFavorito(gasolineraMock);
      expect(service.esFavorito('1001')).toBeTrue();
      service.toggleFavorito(gasolineraMock);
      expect(service.esFavorito('1001')).toBeFalse();
      service.toggleFavorito(gasolineraMock);
      expect(service.esFavorito('1001')).toBeTrue();
    });
  });

  // ─── limpiarFavoritos ──────────────────────────────────────────────────────

  describe('limpiarFavoritos', () => {
    it('debería eliminar todos los favoritos', () => {
      service.agregarFavorito(gasolineraMock);
      service.agregarFavorito(gasolineraMock2);
      service.limpiarFavoritos();
      expect(service.getFavoritosActuales()).toEqual([]);
    });

    it('debería limpiar localStorage', () => {
      service.agregarFavorito(gasolineraMock);
      service.limpiarFavoritos();
      expect(localStorage.getItem('gasolineras_favoritos')).toBeNull();
    });
  });

  // ─── Persistencia entre instancias ────────────────────────────────────────

  describe('persistencia', () => {
    it('debería cargar favoritos del localStorage al crear el servicio', () => {
      // Simular datos previos en localStorage
      const datos = JSON.stringify([gasolineraMock]);
      localStorage.setItem('gasolineras_favoritos', datos);

      // Crear nueva instancia
      const nuevoService = new FavoritosService();
      expect(nuevoService.getFavoritosActuales().length).toBe(1);
      expect(nuevoService.getFavoritosActuales()[0].id).toBe('1001');
    });

    it('debería manejar JSON corrupto en localStorage', () => {
      localStorage.setItem('gasolineras_favoritos', 'esto no es JSON válido');

      const nuevoService = new FavoritosService();
      expect(nuevoService.getFavoritosActuales()).toEqual([]);
    });
  });

  // ─── Observable ────────────────────────────────────────────────────────────

  describe('observable getFavoritos', () => {
    it('debería emitir cambios al agregar', (done) => {
      const emisiones: number[] = [];

      service.getFavoritos().subscribe(favoritos => {
        emisiones.push(favoritos.length);
        if (emisiones.length === 2) {
          expect(emisiones).toEqual([0, 1]);
          done();
        }
      });

      service.agregarFavorito(gasolineraMock);
    });

    it('debería emitir cambios al eliminar', (done) => {
      service.agregarFavorito(gasolineraMock);

      const emisiones: number[] = [];
      service.getFavoritos().subscribe(favoritos => {
        emisiones.push(favoritos.length);
        if (emisiones.length === 2) {
          expect(emisiones).toEqual([1, 0]);
          done();
        }
      });

      service.eliminarFavorito('1001');
    });
  });
});
