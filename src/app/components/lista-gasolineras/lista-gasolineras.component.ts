import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { GasolinerasService } from '../../services/gasolineras.service';
import { FavoritosService } from '../../services/favoritos.service';
import { GasolineraSimplificada, ProvinciaMiteco, TipoCombustible } from '../../models/gasolinera.model';
import { ConfigAhorro } from '../calculadora-ahorro/calculadora-ahorro.component';

const MAX_RESULTADOS_VISIBLES = 50;
const RADIO_CERCANAS_KM = 20; // Radio para buscar localidades cercanas
const MAX_LOCALIDADES_CERCANAS = 5; // Máximo de localidades cercanas a mostrar

export interface GrupoLocalidadCercana {
  localidad: string;
  distanciaDesdeOrigen: number; // km desde el centro de la localidad buscada
  gasolineras: GasolineraSimplificada[];
}

@Component({
  selector: 'app-lista-gasolineras',
  templateUrl: './lista-gasolineras.component.html',
  styleUrls: ['./lista-gasolineras.component.scss']
})
export class ListaGasolinerasComponent implements OnInit, OnDestroy {
  gasolineras: GasolineraSimplificada[] = [];
  gasolinerasCompletas: GasolineraSimplificada[] = [];
  private provinciasMiteco: ProvinciaMiteco[] = [];
  private provinciasPorNombre = new Map<string, string>();
  gasolinerasFiltradas: GasolineraSimplificada[] = [];
  localidadesCercanas: GrupoLocalidadCercana[] = [];
  favoritos: GasolineraSimplificada[] = [];
  provincias: string[] = [];
  localidades: string[] = [];
  localidadesPorProvincia: Record<string, string[]> = {};
  loading = false;
  error: string | null = null;
  esperandoSeleccion = true;
  ubicacionUsuario: { lat: number; lng: number } | null = null;
  mostrandoCercanas = false;
  mostrarFavoritos = false;
  numeroFavoritos = 0;
  favoritosIdSet = new Set<string>();
  totalResultados = 0;
  totalGasolineras = 0;
  gasolinerasCargadas = 0;
  cargandoEnSegundoPlano = false;
  readonly maxResultadosVisibles = MAX_RESULTADOS_VISIBLES;

  // Calculadora de ahorro
  litrosRepostar = 0;
  consumoVehiculo = 7;
  precioMedioCombustible = 0;
  
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
  private timerFinCarga: number | null = null;
  private timerCatalogos: number | null = null;
  private totalProcesado = 0;
  private cargaGasolinerasSub: Subscription | null = null;
  private provinciasSub: Subscription | null = null;
  private modoCargaActual: 'completa' | 'provincia' = 'completa';
  private provinciaCargadaActual = '';
  private provinciasSet = new Set<string>();
  private localidadesSet = new Set<string>();
  private localidadesPorProvinciaMap = new Map<string, Set<string>>();

  constructor(
    private gasolinerasService: GasolinerasService,
    private favoritosService: FavoritosService
  ) {}

  ngOnInit(): void {
    this.precargarProvincias();
    
    // Escuchar cambios en favoritos
    this.favoritosService.getFavoritos()
      .pipe(takeUntil(this.destroy$))
      .subscribe(favoritos => {
        this.favoritos = favoritos;
        this.numeroFavoritos = favoritos.length;
        this.favoritosIdSet = new Set(favoritos.map(f => f.id));
      });
  }

  ngOnDestroy(): void {
    this.cargaGasolinerasSub?.unsubscribe();
    this.provinciasSub?.unsubscribe();
    this.cancelarCargaProgresiva();
    this.cancelarPublicacionCatalogos();
    this.destroy$.next();
    this.destroy$.complete();
  }

  get hayDatosCargados(): boolean {
    return this.gasolinerasCompletas.length > 0;
  }

  private precargarProvincias(): void {
    this.provinciasSub?.unsubscribe();
    this.provinciasSub = this.gasolinerasService.obtenerProvincias()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (provincias) => {
          this.provinciasMiteco = provincias;
          this.provinciasPorNombre = new Map(
            provincias.map(provincia => [
              provincia.Provincia,
              (provincia.IDPovincia || provincia.IDProvincia || '').trim()
            ])
          );
          this.provincias = provincias.map(provincia => provincia.Provincia);

          // Auto-seleccionar A Coruña en la primera carga
          if (this.esperandoSeleccion) {
            const provinciaDefecto = this.provincias.find(p => p.toLowerCase().includes('coruña'));
            if (provinciaDefecto) {
              this.filtros = { ...this.filtros, provincia: provinciaDefecto };
              this.cargarGasolinerasProvinciaSeleccionada(provinciaDefecto);
            }
          }
        },
        error: (err) => {
          console.error('Error al cargar provincias:', err);
        }
      });
  }

  cargarGasolineras(): void {
    this.cargaGasolinerasSub?.unsubscribe();
    this.modoCargaActual = 'completa';
    this.provinciaCargadaActual = '';
    this.reiniciarDatosCargados();
    this.loading = true;
    this.esperandoSeleccion = false;
    this.error = null;
    let primeraEmision = true;

    // obtenerGasolinerasCompletas() carga las ~52 provincias en paralelo (8 a la vez)
    // y emite un array acumulado cada vez que llega una provincia nueva.
    // Primera emisión ~300 ms; carga completa en ~5-10 s.
    this.cargaGasolinerasSub = this.gasolinerasService.obtenerGasolinerasCompletas()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (gasolineras) => {
          const nuevasGasolineras = gasolineras.slice(this.totalProcesado);

          if (nuevasGasolineras.length === 0) {
            this.resetearTimerFin();
            return;
          }

          this.gasolinerasCompletas = gasolineras;
          this.gasolineras = gasolineras;
          this.totalGasolineras = gasolineras.length;
          this.gasolinerasCargadas = gasolineras.length;
          this.totalProcesado = gasolineras.length;

          this.actualizarCatalogosIncremental(nuevasGasolineras);

          if (!this.mostrandoCercanas) {
            this.aplicarFiltrosIncremental(nuevasGasolineras, primeraEmision);
          }

          if (primeraEmision) {
            primeraEmision = false;
            this.loading = false;
            this.cargandoEnSegundoPlano = true;
          }

          // Reinicia el temporizador: si no llega otra emisión en 3 s,
          // consideramos que todas las provincias ya se cargaron.
          this.resetearTimerFin();
        },
        error: (err) => {
          console.error('Error al cargar gasolineras:', err);
          this.error = 'Error al cargar los datos. Por favor, intenta de nuevo más tarde.';
          this.loading = false;
          this.cancelarCargaProgresiva();
        }
      });
  }

  private cargarGasolinerasProvinciaSeleccionada(nombreProvincia: string): void {
    const idProvincia = this.provinciasPorNombre.get(nombreProvincia)?.trim();

    if (!idProvincia) {
      this.reiniciarDatosCargados();
      this.error = 'No se pudo resolver la provincia seleccionada.';
      this.loading = false;
      return;
    }

    this.cargaGasolinerasSub?.unsubscribe();
    this.reiniciarDatosCargados();
    this.modoCargaActual = 'provincia';
    this.provinciaCargadaActual = nombreProvincia;
    this.loading = true;
    this.esperandoSeleccion = false;
    this.error = null;

    this.cargaGasolinerasSub = this.gasolinerasService.obtenerGasolinerasPorProvinciaId(idProvincia)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (gasolineras) => {
          this.cargandoEnSegundoPlano = false;
          this.totalProcesado = gasolineras.length;
          this.gasolineras = gasolineras;
          this.gasolinerasCompletas = gasolineras;
          this.totalGasolineras = gasolineras.length;
          this.gasolinerasCargadas = gasolineras.length;

          this.extraerProvinciasYLocalidades();
          this.aplicarFiltros();
          this.loading = false;
        },
        error: (err) => {
          console.error('Error al cargar gasolineras de la provincia:', err);
          this.error = 'Error al cargar las gasolineras de la provincia seleccionada.';
          this.loading = false;
        }
      });
  }

  private resetearTimerFin(): void {
    if (this.timerFinCarga !== null) {
      window.clearTimeout(this.timerFinCarga);
    }

    this.cargandoEnSegundoPlano = true;
    this.timerFinCarga = window.setTimeout(() => {
      this.cargandoEnSegundoPlano = false;
      this.timerFinCarga = null;
      this.publicarCatalogos();
    }, 3000);
  }

  private cancelarCargaProgresiva(): void {
    if (this.timerFinCarga !== null) {
      window.clearTimeout(this.timerFinCarga);
      this.timerFinCarga = null;
    }
    this.cargandoEnSegundoPlano = false;
  }

  private cancelarPublicacionCatalogos(): void {
    if (this.timerCatalogos !== null) {
      window.clearTimeout(this.timerCatalogos);
      this.timerCatalogos = null;
    }
  }

  private reiniciarDatosCargados(): void {
    this.cancelarCargaProgresiva();
    this.cancelarPublicacionCatalogos();
    this.gasolineras = [];
    this.gasolinerasCompletas = [];
    this.gasolinerasFiltradas = [];
    this.localidadesCercanas = [];
    this.localidades = [];
    this.localidadesPorProvincia = {};
    this.totalResultados = 0;
    this.totalGasolineras = 0;
    this.gasolinerasCargadas = 0;
    this.totalProcesado = 0;
    this.provinciasSet.clear();
    this.localidadesSet.clear();
    this.localidadesPorProvinciaMap.clear();
  }

  private actualizarCatalogosIncremental(gasolineras: GasolineraSimplificada[]): void {
    for (const gasolinera of gasolineras) {
      if (gasolinera.provincia) {
        this.provinciasSet.add(gasolinera.provincia);
      }

      if (gasolinera.localidad) {
        this.localidadesSet.add(gasolinera.localidad);
      }

      if (gasolinera.provincia && gasolinera.localidad) {
        if (!this.localidadesPorProvinciaMap.has(gasolinera.provincia)) {
          this.localidadesPorProvinciaMap.set(gasolinera.provincia, new Set<string>());
        }

        this.localidadesPorProvinciaMap.get(gasolinera.provincia)!.add(gasolinera.localidad);
      }
    }

    this.programarPublicacionCatalogos();
  }

  private programarPublicacionCatalogos(): void {
    if (this.timerCatalogos !== null) {
      return;
    }

    this.timerCatalogos = window.setTimeout(() => {
      this.publicarCatalogos();
      this.timerCatalogos = null;
    }, 250);
  }

  private publicarCatalogos(): void {
    this.provincias = this.provinciasMiteco.map(provincia => provincia.Provincia);
    this.localidades = Array.from(this.localidadesSet).sort();
    this.localidadesPorProvincia = Array.from(this.localidadesPorProvinciaMap.entries()).reduce<Record<string, string[]>>((acc, [provincia, localidades]) => {
      acc[provincia] = Array.from(localidades).sort();
      return acc;
    }, {});
  }

  extraerProvinciasYLocalidades(): void {
    this.provinciasSet.clear();
    this.localidadesSet.clear();
    this.localidadesPorProvinciaMap.clear();
    this.actualizarCatalogosIncremental(this.gasolinerasCompletas);
    this.publicarCatalogos();
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
    this.recalcularPrecioMedio();

    // Buscar localidades cercanas si hay filtro de localidad
    if (localidadFiltro) {
      this.calcularLocalidadesCercanas(localidadFiltro, provinciaFiltro, tipoCombustible);
    } else {
      this.localidadesCercanas = [];
    }
  }

  /**
   * Calcula las localidades cercanas a la localidad buscada.
   * Encuentra el "centro" de la localidad seleccionada (promedio de coordenadas)
   * y busca gasolineras de otras localidades dentro de un radio determinado.
   */
  private calcularLocalidadesCercanas(
    localidadFiltro: string,
    provinciaFiltro: string,
    tipoCombustible: string
  ): void {
    // 1. Encontrar todas las gasolineras de la localidad seleccionada para calcular su centro
    const gasolinerasLocalidad = this.gasolineras.filter(g =>
      g.localidad.toLowerCase().includes(localidadFiltro) &&
      (!provinciaFiltro || g.provincia.toLowerCase().includes(provinciaFiltro))
    );

    if (gasolinerasLocalidad.length === 0) {
      this.localidadesCercanas = [];
      return;
    }

    // 2. Calcular el centro geográfico de la localidad
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;

    for (const g of gasolinerasLocalidad) {
      if (g.latitud && g.longitud) {
        sumLat += g.latitud;
        sumLng += g.longitud;
        count++;
      }
    }

    if (count === 0) {
      this.localidadesCercanas = [];
      return;
    }

    const centroLat = sumLat / count;
    const centroLng = sumLng / count;

    // 3. Buscar gasolineras de OTRAS localidades dentro del radio
    const localidadOriginal = gasolinerasLocalidad[0].localidad.toLowerCase();
    const gruposPorLocalidad = new Map<string, GasolineraSimplificada[]>();
    const distanciasPorLocalidad = new Map<string, number>();

    for (const gasolinera of this.gasolineras) {
      // Saltar gasolineras de la misma localidad
      if (gasolinera.localidad.toLowerCase() === localidadOriginal) {
        continue;
      }

      // Filtrar por provincia si corresponde
      if (provinciaFiltro && !gasolinera.provincia.toLowerCase().includes(provinciaFiltro)) {
        continue;
      }

      // Calcular distancia al centro de la localidad buscada
      const distancia = this.calcularDistancia(
        centroLat, centroLng,
        gasolinera.latitud, gasolinera.longitud
      );

      if (distancia <= RADIO_CERCANAS_KM) {
        const nombreLocalidad = gasolinera.localidad;
        if (!gruposPorLocalidad.has(nombreLocalidad)) {
          gruposPorLocalidad.set(nombreLocalidad, []);
          distanciasPorLocalidad.set(nombreLocalidad, distancia);
        } else {
          // Guardar la distancia mínima para ordenar
          const distanciaActual = distanciasPorLocalidad.get(nombreLocalidad)!;
          if (distancia < distanciaActual) {
            distanciasPorLocalidad.set(nombreLocalidad, distancia);
          }
        }
        gruposPorLocalidad.get(nombreLocalidad)!.push(gasolinera);
      }
    }

    // 4. Convertir a array, ordenar por precio y por distancia
    const tipo = tipoCombustible as keyof GasolineraSimplificada['precios'];
    const grupos: GrupoLocalidadCercana[] = [];

    gruposPorLocalidad.forEach((gasolineras, localidad) => {
      // Ordenar gasolineras del grupo por precio
      const ordenadas = gasolineras
        .filter(g => g.precios[tipo] && g.precios[tipo]! > 0)
        .sort((a, b) => (a.precios[tipo] ?? Infinity) - (b.precios[tipo] ?? Infinity))
        .slice(0, 5); // Máximo 5 gasolineras por localidad cercana

      if (ordenadas.length > 0) {
        grupos.push({
          localidad,
          distanciaDesdeOrigen: Math.round((distanciasPorLocalidad.get(localidad) ?? 0) * 10) / 10,
          gasolineras: ordenadas
        });
      }
    });

    // Ordenar grupos por distancia
    grupos.sort((a, b) => a.distanciaDesdeOrigen - b.distanciaDesdeOrigen);

    this.localidadesCercanas = grupos.slice(0, MAX_LOCALIDADES_CERCANAS);
  }

  private aplicarFiltrosIncremental(gasolineras: GasolineraSimplificada[], reiniciar: boolean = false): void {
    const provinciaFiltro = this.filtros.provincia.toLowerCase();
    const localidadFiltro = this.filtros.localidad.toLowerCase();
    const codigoPostalFiltro = this.filtros.codigoPostal.trim();
    const tipoCombustible = this.filtros.tipoCombustible;

    if (reiniciar) {
      this.totalResultados = 0;
      this.gasolinerasFiltradas = [];
    }

    for (const gasolinera of gasolineras) {
      if (!this.coincideConFiltros(gasolinera, provinciaFiltro, localidadFiltro, codigoPostalFiltro)) {
        continue;
      }

      this.totalResultados++;
      const precio = gasolinera.precios[tipoCombustible] ?? Number.POSITIVE_INFINITY;
      this.insertarOrdenado(
        this.gasolinerasFiltradas,
        gasolinera,
        precio,
        item => item.precios[tipoCombustible] ?? Number.POSITIVE_INFINITY
      );
    }
  }

  onFiltrosChange(filtros: any): void {
    const provinciaAnterior = this.filtros.provincia;
    this.filtros = { ...this.filtros, ...filtros };
    this.mostrandoCercanas = false;
    this.mostrarFavoritos = false;
    this.localidadesCercanas = [];

    if (this.filtros.provincia !== provinciaAnterior) {
      if (this.filtros.provincia) {
        this.cargarGasolinerasProvinciaSeleccionada(this.filtros.provincia);
        return;
      }

      if (this.modoCargaActual === 'provincia') {
        this.cargaGasolinerasSub?.unsubscribe();
        this.reiniciarDatosCargados();
        this.modoCargaActual = 'completa';
        this.provinciaCargadaActual = '';
        this.esperandoSeleccion = true;
        return;
      }
    }

    if (this.modoCargaActual === 'provincia' && this.filtros.provincia && this.filtros.provincia !== this.provinciaCargadaActual) {
      this.cargarGasolinerasProvinciaSeleccionada(this.filtros.provincia);
      return;
    }

    this.gasolineras = this.gasolinerasCompletas;
    this.aplicarFiltros();
  }

  buscarCercanas(): void {
    if (!navigator.geolocation) {
      this.error = 'Tu navegador no soporta geolocalización.';
      return;
    }

    this.loading = true;
    this.esperandoSeleccion = false;
    this.error = null;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.ubicacionUsuario = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        // Si ya tenemos datos, ordenar directamente
        if (this.gasolinerasCompletas.length > 0) {
          this.mostrarGasolinerasCercanas();
          this.loading = false;
          return;
        }

        // Si no hay datos, cargar todo y mostrar cercanas cuando llegue la primera emisión
        this.cargaGasolinerasSub?.unsubscribe();
        this.reiniciarDatosCargados();
        this.modoCargaActual = 'completa';
        let primeraEmision = true;

        this.cargaGasolinerasSub = this.gasolinerasService.obtenerGasolinerasCompletas()
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (gasolineras) => {
              this.gasolinerasCompletas = gasolineras;
              this.gasolineras = gasolineras;
              this.totalGasolineras = gasolineras.length;
              this.gasolinerasCargadas = gasolineras.length;
              this.totalProcesado = gasolineras.length;
              this.actualizarCatalogosIncremental(gasolineras);
              this.mostrarGasolinerasCercanas();

              if (primeraEmision) {
                primeraEmision = false;
                this.loading = false;
                this.cargandoEnSegundoPlano = true;
              }
              this.resetearTimerFin();
            },
            error: (err) => {
              console.error('Error al cargar gasolineras:', err);
              this.error = 'Error al cargar los datos. Por favor, intenta de nuevo más tarde.';
              this.loading = false;
            }
          });
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
    this.localidadesCercanas = [];
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
    this.gasolinerasService.refrescar();
    this.precargarProvincias();
    if (this.provinciaCargadaActual) {
      this.cargarGasolinerasProvinciaSeleccionada(this.provinciaCargadaActual);
    } else {
      this.cargarGasolineras();
    }
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

  onConfigAhorroChange(config: ConfigAhorro): void {
    this.litrosRepostar = config.litros;
    this.consumoVehiculo = config.consumo;
    this.recalcularPrecioMedio();
  }

  private recalcularPrecioMedio(): void {
    const tipo = this.filtros.tipoCombustible as keyof GasolineraSimplificada['precios'];
    const conPrecio = this.gasolinerasCompletas.filter(g => g.precios[tipo] && g.precios[tipo]! > 0);
    if (conPrecio.length > 0) {
      const suma = conPrecio.reduce((acc, g) => acc + (g.precios[tipo] ?? 0), 0);
      this.precioMedioCombustible = suma / conPrecio.length;
    } else {
      this.precioMedioCombustible = 0;
    }
  }
}
