import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, concat, interval, of, shareReplay, switchMap, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, Gasolinera, GasolineraSimplificada, PreciosCombustible } from '../models/gasolinera.model';

@Injectable({
  providedIn: 'root'
})
export class GasolinerasService {
  // URL de la API pública del MITECO
  private readonly API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
  
  // Intervalo de actualización (5 minutos)
  private readonly REFRESH_INTERVAL = 5 * 60 * 1000;

  // Cache persistente en navegador
  private readonly CACHE_KEY = 'gasolineras-cache-v1';
  private readonly CACHE_TIMESTAMP_KEY = 'gasolineras-cache-timestamp-v1';
  
  // Cache observable para evitar peticiones duplicadas
  private gasolineras$: Observable<GasolineraSimplificada[]> | null = null;
  private timeoutGuardadoCache: number | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Obtiene todas las gasolineras con actualización automática
   */
  obtenerGasolineras(): Observable<GasolineraSimplificada[]> {
    if (!this.gasolineras$) {
      const gasolinerasEnCache = this.obtenerGasolinerasDesdeCache();

      if (gasolinerasEnCache) {
        this.gasolineras$ = concat(
          of(gasolinerasEnCache),
          interval(this.REFRESH_INTERVAL).pipe(
            switchMap(() => this.fetchGasolineras())
          )
        ).pipe(
          shareReplay(1)
        );
      } else {
        this.gasolineras$ = this.fetchGasolineras().pipe(
          shareReplay(1)
        );
      }
    }

    return this.gasolineras$;
  }

  /**
   * Obtiene las gasolineras de una provincia específica
   */
  obtenerGasolinerasPorProvincia(provincia: string): Observable<GasolineraSimplificada[]> {
    return this.obtenerGasolineras().pipe(
      map(gasolineras => gasolineras.filter(g => 
        g.provincia.toLowerCase().includes(provincia.toLowerCase())
      ))
    );
  }

  /**
   * Obtiene las gasolineras de una localidad específica
   */
  obtenerGasolinerasPorLocalidad(localidad: string): Observable<GasolineraSimplificada[]> {
    return this.obtenerGasolineras().pipe(
      map(gasolineras => gasolineras.filter(g => 
        g.localidad.toLowerCase().includes(localidad.toLowerCase())
      ))
    );
  }

  /**
   * Busca gasolineras por código postal
   */
  obtenerGasolinerasPorCP(codigoPostal: string): Observable<GasolineraSimplificada[]> {
    return this.obtenerGasolineras().pipe(
      map(gasolineras => gasolineras.filter(g => 
        g.codigoPostal.includes(codigoPostal)
      ))
    );
  }

  /**
   * Obtiene las gasolineras más baratas para un tipo de combustible
   */
  obtenerMasBaratas(tipoCombustible: keyof PreciosCombustible, limite: number = 10): Observable<GasolineraSimplificada[]> {
    return this.obtenerGasolineras().pipe(
      map(gasolineras => {
        return gasolineras
          .filter(g => g.precios[tipoCombustible] && g.precios[tipoCombustible]! > 0)
          .sort((a, b) => {
            const precioA = a.precios[tipoCombustible] || Infinity;
            const precioB = b.precios[tipoCombustible] || Infinity;
            return precioA - precioB;
          })
          .slice(0, limite);
      })
    );
  }

  /**
   * Realiza la petición HTTP a la API del MITECO
   */
  private fetchGasolineras(): Observable<GasolineraSimplificada[]> {
    return this.http.get<ApiResponse>(this.API_URL).pipe(
      map(response => this.transformarDatos(response.ListaEESSPrecio)),
      tap(gasolineras => this.programarGuardadoEnCache(gasolineras))
    );
  }

  private programarGuardadoEnCache(gasolineras: GasolineraSimplificada[]): void {
    if (this.timeoutGuardadoCache !== null) {
      window.clearTimeout(this.timeoutGuardadoCache);
    }

    this.timeoutGuardadoCache = window.setTimeout(() => {
      this.guardarGasolinerasEnCache(gasolineras);
      this.timeoutGuardadoCache = null;
    }, 0);
  }

  /**
   * Transforma los datos de la API al formato simplificado
   */
  private transformarDatos(gasolineras: Gasolinera[]): GasolineraSimplificada[] {
    return gasolineras.map(g => ({
      id: g['IDEESS'],
      nombre: g['Rótulo'] || 'Sin nombre',
      direccion: g['Dirección'],
      localidad: g['Localidad'],
      provincia: g['Provincia'],
      codigoPostal: g['C.P.'],
      horario: g['Horario'] || 'No disponible',
      latitud: this.parsearCoordenada(g['Latitud']),
      longitud: this.parsearCoordenada(g['Longitud (WGS84)']),
      precios: {
        gasolina95: this.parsearPrecio(g['Precio Gasolina 95 E5']),
        gasolina98: this.parsearPrecio(g['Precio Gasolina 98 E5']),
        diesel: this.parsearPrecio(g['Precio Gasoleo A']),
        dieselPremium: this.parsearPrecio(g['Precio Gasoleo Premium']),
        bioetanol: this.parsearPrecio(g['Precio Bioetanol']),
        biodiesel: this.parsearPrecio(g['Precio Biodiesel']),
        gnc: this.parsearPrecio(g['Precio Gas Natural Comprimido']),
        glp: this.parsearPrecio(g['Precio Gases licuados del petróleo'])
      }
    }));
  }

  /**
   * Convierte string de precio a número
   */
  private parsearPrecio(precio: string): number | undefined {
    if (!precio || precio.trim() === '') return undefined;
    const precioLimpio = precio.replace(',', '.');
    const numero = parseFloat(precioLimpio);
    return isNaN(numero) ? undefined : numero;
  }

  /**
   * Convierte coordenada de string a número
   */
  private parsearCoordenada(coordenada: string): number {
    if (!coordenada) return 0;
    const coordenadaLimpia = coordenada.replace(',', '.');
    return parseFloat(coordenadaLimpia) || 0;
  }

  private obtenerGasolinerasDesdeCache(): GasolineraSimplificada[] | null {
    try {
      const cacheSerializada = localStorage.getItem(this.CACHE_KEY);
      const timestamp = localStorage.getItem(this.CACHE_TIMESTAMP_KEY);

      if (!cacheSerializada || !timestamp) {
        return null;
      }

      const cacheSigueViva = Date.now() - Number(timestamp) < this.REFRESH_INTERVAL;
      if (!cacheSigueViva) {
        this.limpiarCachePersistente();
        return null;
      }

      return JSON.parse(cacheSerializada) as GasolineraSimplificada[];
    } catch {
      this.limpiarCachePersistente();
      return null;
    }
  }

  private guardarGasolinerasEnCache(gasolineras: GasolineraSimplificada[]): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(gasolineras));
      localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch {
      this.limpiarCachePersistente();
    }
  }

  private limpiarCachePersistente(): void {
    localStorage.removeItem(this.CACHE_KEY);
    localStorage.removeItem(this.CACHE_TIMESTAMP_KEY);
  }

  /**
   * Invalida el cache para forzar actualización
   */
  refrescar(): void {
    this.limpiarCachePersistente();
    this.gasolineras$ = null;
  }
}
