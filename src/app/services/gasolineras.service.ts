import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, shareReplay, startWith, of, from } from 'rxjs';
import { map, mergeMap, scan, catchError } from 'rxjs/operators';
import { ApiResponse, Gasolinera, GasolineraSimplificada, PreciosCombustible, ProvinciaMiteco } from '../models/gasolinera.model';

@Injectable({
  providedIn: 'root'
})
export class GasolinerasService {
  // URL de la API pública del MITECO
  private readonly API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
  private readonly API_URL_POR_PROVINCIA = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/';
  private readonly API_URL_PROVINCIAS = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/Listados/Provincias/';

  // Intervalo de actualización (5 minutos)
  private readonly REFRESH_INTERVAL = 5 * 60 * 1000;

  // Cache observable para evitar peticiones duplicadas
  private gasolineras$: Observable<GasolineraSimplificada[]> | null = null;
  private gasolinerasCompletas$: Observable<GasolineraSimplificada[]> | null = null;
  private provincias$: Observable<ProvinciaMiteco[]> | null = null;
  private gasolinerasPorProvinciaCache = new Map<string, Observable<GasolineraSimplificada[]>>();

  constructor(private http: HttpClient) {
    this.limpiarCacheLegacyPersistente();
  }

  /**
   * Obtiene listado de provincias (respuesta ligera)
   */
  obtenerProvincias(): Observable<ProvinciaMiteco[]> {
    if (!this.provincias$) {
      this.provincias$ = this.http.get<ProvinciaMiteco[]>(this.API_URL_PROVINCIAS).pipe(
        map(provincias =>
          [...provincias].sort((a, b) => a.Provincia.localeCompare(b.Provincia, 'es'))
        ),
        shareReplay(1)
      );
    }
    return this.provincias$;
  }

  /**
   * Obtiene gasolineras de una provincia por ID (carga mucho más rápida que toda España)
   */
  obtenerGasolinerasPorProvinciaId(idProvincia: string): Observable<GasolineraSimplificada[]> {
    const idNormalizado = idProvincia.trim();

    if (!idNormalizado) {
      return of([]);
    }

    if (!this.gasolinerasPorProvinciaCache.has(idNormalizado)) {
      const provincia$ = interval(this.REFRESH_INTERVAL).pipe(
        startWith(0),
        switchMap(() => this.fetchGasolinerasPorProvincia(idNormalizado)),
        shareReplay(1)
      );
      this.gasolinerasPorProvinciaCache.set(idNormalizado, provincia$);
    }

    return this.gasolinerasPorProvinciaCache.get(idNormalizado)!;
  }

  /**
   * Obtiene todas las gasolineras con actualización automática (petición única grande)
   */
  obtenerGasolineras(): Observable<GasolineraSimplificada[]> {
    if (!this.gasolineras$) {
      this.gasolineras$ = interval(this.REFRESH_INTERVAL).pipe(
        startWith(0),
        switchMap(() => this.fetchGasolineras()),
        shareReplay(1)
      );
    }
    return this.gasolineras$;
  }

  /**
   * Obtiene TODAS las gasolineras cargando provincias en paralelo — emite progresivamente.
   * Primera emisión en ~300 ms en lugar de esperar todos los 12.915 registros de golpe.
   */
  obtenerGasolinerasCompletas(): Observable<GasolineraSimplificada[]> {
    if (!this.gasolinerasCompletas$) {
      this.gasolinerasCompletas$ = interval(this.REFRESH_INTERVAL).pipe(
        startWith(0),
        switchMap(() => this.fetchTodasLasProvinciasProgresivo()),
        shareReplay(1)
      );
    }
    return this.gasolinerasCompletas$;
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
      map(gasolineras =>
        gasolineras
          .filter(g => g.precios[tipoCombustible] && g.precios[tipoCombustible]! > 0)
          .sort((a, b) => {
            const precioA = a.precios[tipoCombustible] || Infinity;
            const precioB = b.precios[tipoCombustible] || Infinity;
            return precioA - precioB;
          })
          .slice(0, limite)
      )
    );
  }

  // ─── Peticiones HTTP ───────────────────────────────────────────────────────

  private fetchGasolineras(): Observable<GasolineraSimplificada[]> {
    return this.http.get<ApiResponse>(this.API_URL).pipe(
      map(response => this.transformarDatos(response.ListaEESSPrecio))
    );
  }

  private fetchGasolinerasPorProvincia(idProvincia: string): Observable<GasolineraSimplificada[]> {
    return this.http.get<ApiResponse>(`${this.API_URL_POR_PROVINCIA}${idProvincia}`).pipe(
      map(response => this.transformarDatos(response.ListaEESSPrecio))
    );
  }

  /**
   * Carga todas las provincias en paralelo (8 simultáneas) y acumula resultados
   * emitiendo cada vez que llega una provincia nueva.
   */
  private fetchTodasLasProvinciasProgresivo(): Observable<GasolineraSimplificada[]> {
    return this.obtenerProvincias().pipe(
      switchMap(provincias =>
        from(provincias).pipe(
          mergeMap(provincia => {
            const id = (provincia.IDPovincia || provincia.IDProvincia || '').trim();
            if (!id) return of([] as GasolineraSimplificada[]);
            return this.fetchGasolinerasPorProvincia(id).pipe(
              catchError(() => of([] as GasolineraSimplificada[]))
            );
          }, 8), // 8 peticiones en paralelo
          scan(
            (acumulado, bloque) => bloque.length ? [...acumulado, ...bloque] : acumulado,
            [] as GasolineraSimplificada[]
          )
        )
      )
    );
  }

  // ─── Transformación ────────────────────────────────────────────────────────

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

  private parsearPrecio(precio: string): number | undefined {
    if (!precio || precio.trim() === '') return undefined;
    const numero = parseFloat(precio.replace(',', '.'));
    return isNaN(numero) ? undefined : numero;
  }

  private parsearCoordenada(coordenada: string): number {
    if (!coordenada) return 0;
    return parseFloat(coordenada.replace(',', '.')) || 0;
  }

  private limpiarCacheLegacyPersistente(): void {
    localStorage.removeItem('gasolineras-cache-v1');
    localStorage.removeItem('gasolineras-cache-timestamp-v1');
  }

  /**
   * Invalida todos los caches para forzar actualización
   */
  refrescar(): void {
    this.gasolineras$ = null;
    this.gasolinerasCompletas$ = null;
    this.provincias$ = null;
    this.gasolinerasPorProvinciaCache.clear();
  }
}
