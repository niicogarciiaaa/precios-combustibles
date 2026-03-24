import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { GasolinerasService } from '../../services/gasolineras.service';
import { FavoritosService } from '../../services/favoritos.service';
import { GasolineraSimplificada, TipoCombustible } from '../../models/gasolinera.model';

const MAX_RESULTADOS_VISIBLES = 50;
const CARGA_INICIAL = 500;
const TAMANO_LOTE = 500;
const RETARDO_ENTRE_LOTES_MS = 30;

@Component({
  selector: 'app-lista-gasolineras',
  templateUrl: './lista-gasolineras.component.html',
  styleUrls: ['./lista-gasolineras.component.scss']
})
export class ListaGasolinerasComponent implements OnInit, OnDestroy {
  gasolineras: GasolineraSimplificada[] = [];
  private gasolinerasCompletas: GasolineraSimplificada[] = [];
  gasolinerasFiltradas: GasolineraSimplificada[] = [];
  favoritos: GasolineraSimplificada[] = [];
  provincias: string[] = [];
  localidades: string[] = [];
  localidadesPorProvincia: Record<string, string[]> = {};
  loading = true;
  error: string | null = null;
  ubicacionUsuario: { lat: number; lng: number } | null = null;
  mostrandoCercanas = false;
  mostrarFavoritos = false;
  numeroFavoritos = 0;
  totalResultados = 0;
  totalGasolineras = 0;
  gasolinerasCargadas = 0;
  cargandoEnSegundoPlano = false;
  readonly maxResultadosVisibles = MAX_RESULTADOS_VISIBLES;
  
  filtros = {
    provincia: '',
    localidad: '',
    codigoPostal: '',
    tipoCombustible: 'diesel' as keyof typeof this.nombresCombustibles
  };

  nombresCombustibles = {
    gasolina95: 'Gasolina 95',
    gasolina98: 'Gasolina 98',
    diesel: 'Diésel',
    dieselPremium: 'Diésel Premium',
    glp: 'GLP',
    gnc: 'GNC',
    bioetanol: 'Bioetanol',
    biodiesel: 'Biodiésel'
  };

  private destroy$ = new Subject<void>();
  private timeoutCargaProgresiva: number | null = null;

  constructor(
    private gasolinerasService: GasolinerasService,
    private favoritosService: FavoritosService
  ) {}

  ngOnInit(): void {
    // Cargar gasolineras
    this.cargarGasolineras();
    
    // Escuchar cambios en favoritos
    this.favoritosService.getFavoritos()
      .pipe(takeUntil(this.destroy$))
      .subscribe(favoritos => {
        this.favoritos = favoritos;
        this.numeroFavoritos = favoritos.length;
      });
  }

  ngOnDestroy(): void {
    this.cancelarCargaProgresiva();
    this.destroy$.next();
    this.destroy$.complete();
  }

  cargarGasolineras(): void {
    this.loading = true;
    this.error = null;

    this.gasolinerasService.obtenerGasolineras()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (gasolineras) => {
          this.iniciarCargaProgresiva(gasolineras);
        },
        error: (err) => {
          console.error('Error al cargar gasolineras:', err);
          this.error = 'Error al cargar los datos. Por favor, intenta de nuevo más tarde.';
          this.loading = false;
        }
      });
  }

  private iniciarCargaProgresiva(gasolineras: GasolineraSimplificada[]): void {
    this.cancelarCargaProgresiva();

    this.gasolinerasCompletas = gasolineras;
    this.totalGasolineras = gasolineras.length;

    const totalInicial = Math.min(CARGA_INICIAL, this.totalGasolineras);
    this.gasolineras = gasolineras.slice(0, totalInicial);
    this.gasolinerasCargadas = this.gasolineras.length;

    this.extraerProvinciasYLocalidades();
    this.aplicarFiltros();
    this.loading = false;

    this.cargandoEnSegundoPlano = this.gasolinerasCargadas < this.totalGasolineras;
    if (this.cargandoEnSegundoPlano) {
      this.programarSiguienteLote();
    }
  }

  private programarSiguienteLote(): void {
    this.timeoutCargaProgresiva = window.setTimeout(() => {
      const inicio = this.gasolinerasCargadas;
      const fin = Math.min(inicio + TAMANO_LOTE, this.totalGasolineras);

      if (inicio >= fin) {
        this.cargandoEnSegundoPlano = false;
        this.timeoutCargaProgresiva = null;
        return;
      }

      this.gasolineras = this.gasolinerasCompletas.slice(0, fin);
      this.gasolinerasCargadas = fin;

      this.extraerProvinciasYLocalidades();
      this.aplicarFiltros();

      this.cargandoEnSegundoPlano = this.gasolinerasCargadas < this.totalGasolineras;

      if (this.cargandoEnSegundoPlano) {
        this.programarSiguienteLote();
      } else {
        this.timeoutCargaProgresiva = null;
      }
    }, RETARDO_ENTRE_LOTES_MS);
  }

  private cancelarCargaProgresiva(): void {
    if (this.timeoutCargaProgresiva !== null) {
      window.clearTimeout(this.timeoutCargaProgresiva);
      this.timeoutCargaProgresiva = null;
    }

    this.cargandoEnSegundoPlano = false;
  }

  extraerProvinciasYLocalidades(): void {
    const provinciasSet = new Set<string>();
    const localidadesSet = new Set<string>();
    const localidadesPorProvinciaMap = new Map<string, Set<string>>();

    this.gasolineras.forEach(g => {
      if (g.provincia) provinciasSet.add(g.provincia);
      if (g.localidad) localidadesSet.add(g.localidad);

      if (g.provincia && g.localidad) {
        if (!localidadesPorProvinciaMap.has(g.provincia)) {
          localidadesPorProvinciaMap.set(g.provincia, new Set<string>());
        }

        localidadesPorProvinciaMap.get(g.provincia)!.add(g.localidad);
      }
    });

    this.provincias = Array.from(provinciasSet).sort();
    this.localidades = Array.from(localidadesSet).sort();
    this.localidadesPorProvincia = Array.from(localidadesPorProvinciaMap.entries()).reduce<Record<string, string[]>>((acc, [provincia, localidades]) => {
      acc[provincia] = Array.from(localidades).sort();
      return acc;
    }, {});
  }

  aplicarFiltros(): void {
    const provinciaFiltro = this.filtros.provincia.toLowerCase();
    const localidadFiltro = this.filtros.localidad.toLowerCase();
    const codigoPostalFiltro = this.filtros.codigoPostal.trim();
    const tipoCombustible = this.filtros.tipoCombustible;
    const resultado: GasolineraSimplificada[] = [];
    let totalCoincidencias = 0;

    for (const gasolinera of this.gasolineras) {
      if (!this.coincideConFiltros(gasolinera, provinciaFiltro, localidadFiltro, codigoPostalFiltro)) {
        continue;
      }

      totalCoincidencias++;
      const precio = gasolinera.precios[tipoCombustible] ?? Number.POSITIVE_INFINITY;
      this.insertarOrdenado(resultado, gasolinera, precio, item => item.precios[tipoCombustible] ?? Number.POSITIVE_INFINITY);
    }

    this.totalResultados = totalCoincidencias;
    this.gasolinerasFiltradas = resultado;
  }

  onFiltrosChange(filtros: any): void {
    this.filtros = { ...this.filtros, ...filtros };
    this.mostrandoCercanas = false;
    this.mostrarFavoritos = false;
    this.aplicarFiltros();
  }

  buscarCercanas(): void {
    if (!navigator.geolocation) {
      this.error = 'Tu navegador no soporta geolocalización.';
      return;
    }

    this.loading = true;
    this.error = null;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.ubicacionUsuario = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        this.mostrarGasolinerasCercanas();
        this.loading = false;
      },
      (error) => {
        this.loading = false;
        if (error.code === error.PERMISSION_DENIED) {
          this.error = 'Debes permitir el acceso a tu ubicación para encontrar gasolineras cercanas.';
        } else {
          this.error = 'No se pudo obtener tu ubicación. Por favor, intenta de nuevo.';
        }
        console.error('Error de geolocalización:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  mostrarGasolinerasCercanas(): void {
    if (!this.ubicacionUsuario) return;

    this.mostrandoCercanas = true;
    const gasolinerasBase = this.gasolinerasCompletas.length > 0 ? this.gasolinerasCompletas : this.gasolineras;
    this.totalResultados = gasolinerasBase.length;

    const gasolinerasConDistancia: GasolineraSimplificada[] = [];

    for (const gasolinera of gasolinerasBase) {
      const distancia = this.calcularDistancia(
        this.ubicacionUsuario.lat,
        this.ubicacionUsuario.lng,
        gasolinera.latitud,
        gasolinera.longitud
      );

      this.insertarOrdenado(
        gasolinerasConDistancia,
        { ...gasolinera, distancia },
        distancia,
        item => item.distancia ?? Number.POSITIVE_INFINITY
      );
    }

    this.gasolinerasFiltradas = gasolinerasConDistancia;
  }

  calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    // Fórmula de Haversine para calcular distancia entre dos puntos en la Tierra
    const R = 6371; // Radio de la Tierra en kilómetros
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c; // Distancia en kilómetros
    
    return distancia;
  }

  toRadians(grados: number): number {
    return grados * (Math.PI / 180);
  }

  refrescar(): void {
    this.cancelarCargaProgresiva();
    this.gasolinerasService.refrescar();
    this.cargarGasolineras();
  }

  limpiarFavoritos(): void {
    if (confirm('¿Estás seguro de que quieres eliminar todos los favoritos?')) {
      this.favoritosService.limpiarFavoritos();
    }
  }

  private coincideConFiltros(
    gasolinera: GasolineraSimplificada,
    provinciaFiltro: string,
    localidadFiltro: string,
    codigoPostalFiltro: string
  ): boolean {
    if (provinciaFiltro && !gasolinera.provincia.toLowerCase().includes(provinciaFiltro)) {
      return false;
    }

    if (localidadFiltro && !gasolinera.localidad.toLowerCase().includes(localidadFiltro)) {
      return false;
    }

    if (codigoPostalFiltro && !gasolinera.codigoPostal.includes(codigoPostalFiltro)) {
      return false;
    }

    return true;
  }

  private insertarOrdenado(
    resultados: GasolineraSimplificada[],
    gasolinera: GasolineraSimplificada,
    valor: number,
    obtenerValor: (item: GasolineraSimplificada) => number
  ): void {
    const ultimoValor = resultados.length > 0
      ? obtenerValor(resultados[resultados.length - 1])
      : Number.POSITIVE_INFINITY;

    if (resultados.length === this.maxResultadosVisibles && valor >= ultimoValor) {
      return;
    }

    const indiceInsercion = resultados.findIndex(item => valor < obtenerValor(item));

    if (indiceInsercion === -1) {
      resultados.push(gasolinera);
    } else {
      resultados.splice(indiceInsercion, 0, gasolinera);
    }

    if (resultados.length > this.maxResultadosVisibles) {
      resultados.pop();
    }
  }

  trackByFn(index: number, item: GasolineraSimplificada): string {
    return item.id;
  }
}
