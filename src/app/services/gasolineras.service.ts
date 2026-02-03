import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, shareReplay, startWith } from 'rxjs';
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
  
  // Cache observable para evitar peticiones duplicadas
  private gasolineras$: Observable<GasolineraSimplificada[]> | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Obtiene todas las gasolineras con actualización automática
   */
  obtenerGasolineras(): Observable<GasolineraSimplificada[]> {
    if (!this.gasolineras$) {
      this.gasolineras$ = interval(this.REFRESH_INTERVAL).pipe(
        startWith(0), // Emite inmediatamente
        switchMap(() => this.fetchGasolineras()),
        shareReplay(1) // Comparte la última emisión entre suscriptores
      );
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
      map(response => this.transformarDatos(response.ListaEESSPrecio))
    );
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

  /**
   * Invalida el cache para forzar actualización
   */
  refrescar(): void {
    this.gasolineras$ = null;
  }
}
