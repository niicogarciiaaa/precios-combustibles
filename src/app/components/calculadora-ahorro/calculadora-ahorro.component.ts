import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { GasolineraSimplificada } from '../../models/gasolinera.model';

export interface ConfigAhorro {
  litros: number;
  consumo: number; // L/100km
}

export interface ComparacionAhorro {
  masCercana: GasolineraSimplificada | null;   // la gasolinera más cercana al usuario
  masBarataCerca: GasolineraSimplificada | null; // la más barata dentro de un radio razonable
  costeCercana: number;
  costeBarataCerca: number;
  distanciaExtra: number;       // km adicionales para llegar a la barata
  costeCombustibleExtra: number; // € gasolina extra por el desplazamiento (ida+vuelta)
  ahorroNeto: number;           // ahorro real descontando el desplazamiento
  precioMedio: number;
}

const RADIO_BUSQUEDA_KM = 25; // Radio para buscar la gasolinera más barata cerca

@Component({
  selector: 'app-calculadora-ahorro',
  templateUrl: './calculadora-ahorro.component.html',
  styleUrls: ['./calculadora-ahorro.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalculadoraAhorroComponent implements OnChanges {
  @Input() gasolineras: GasolineraSimplificada[] = [];        // filtradas (las visibles)
  @Input() todasGasolineras: GasolineraSimplificada[] = [];   // todas las cargadas (sin filtro)
  @Input() tipoCombustible: string = 'diesel';
  @Input() tieneUbicacion = false;

  @Output() configChange = new EventEmitter<ConfigAhorro>();

  litros = 40;
  consumo = 7;
  panelAbierto = false;

  comparacion: ComparacionAhorro | null = null;

  nombresCombustibles: Record<string, string> = {
    gasolina95: 'Gasolina 95',
    gasolina98: 'Gasolina 98',
    diesel: 'Diésel',
    dieselPremium: 'Diésel Premium',
    glp: 'GLP',
    gnc: 'GNC',
    bioetanol: 'Bioetanol',
    biodiesel: 'Biodiésel'
  };

  /** Helper para acceder al precio del tipo seleccionado sin error de index signature */
  obtenerPrecio(gasolinera: GasolineraSimplificada): number | undefined {
    const tipo = this.tipoCombustible as keyof GasolineraSimplificada['precios'];
    return gasolinera.precios[tipo];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['gasolineras'] || changes['todasGasolineras'] || changes['tipoCombustible']) {
      this.calcularComparacion();
    }
  }

  togglePanel(): void {
    this.panelAbierto = !this.panelAbierto;
  }

  onConfigChange(): void {
    // Validar rangos
    if (this.litros < 1) this.litros = 1;
    if (this.litros > 200) this.litros = 200;
    if (this.consumo < 1) this.consumo = 1;
    if (this.consumo > 50) this.consumo = 50;

    this.configChange.emit({ litros: this.litros, consumo: this.consumo });
    this.calcularComparacion();
  }

  private calcularComparacion(): void {
    if (!this.gasolineras || this.gasolineras.length < 1) {
      this.comparacion = null;
      return;
    }

    const tipo = this.tipoCombustible as keyof GasolineraSimplificada['precios'];
    const conPrecio = this.gasolineras.filter(g => g.precios[tipo] && g.precios[tipo]! > 0);

    // Precio medio general
    const suma = conPrecio.reduce((acc, g) => acc + (g.precios[tipo] ?? 0), 0);
    const precioMedio = conPrecio.length > 0 ? suma / conPrecio.length : 0;

    // --- Con ubicación (distancia ya calculada) ---
    if (this.tieneUbicacion) {
      this.calcularConUbicacion(conPrecio, tipo, precioMedio);
      return;
    }

    // --- Sin ubicación: usar coordenadas para buscar cercanas ---
    // Si hay pocas gasolineras filtradas (≤3) y tenemos el dataset completo,
    // buscar alternativas cercanas por coordenadas
    if (conPrecio.length <= 3 && this.todasGasolineras.length > conPrecio.length) {
      this.calcularConCoordenadas(conPrecio, tipo, precioMedio);
      return;
    }

    // Modo sin ubicación con suficientes resultados: más barata vs más cara visible
    this.calcularSinUbicacion(conPrecio, tipo, precioMedio);
  }

  /** Comparación cuando el usuario ha dado su ubicación (hay .distancia) */
  private calcularConUbicacion(
    conPrecio: GasolineraSimplificada[],
    tipo: keyof GasolineraSimplificada['precios'],
    precioMedio: number
  ): void {
    let pool = conPrecio.filter(g => g.distancia !== undefined);

    // Si hay pocas con distancia en el filtro, ampliar al dataset completo
    if (pool.length <= 1 && this.todasGasolineras.length > 0) {
      pool = this.todasGasolineras.filter(g =>
        g.distancia !== undefined && g.precios[tipo] && g.precios[tipo]! > 0
      );
    }

    if (pool.length === 0) {
      this.comparacion = this.crearComparacionVacia(precioMedio);
      return;
    }

    // La más cercana
    const masCercana = pool.reduce((closest, g) =>
      (g.distancia ?? Infinity) < (closest.distancia ?? Infinity) ? g : closest
    );

    // La más barata dentro de un radio razonable
    const distanciaCercana = masCercana.distancia ?? 0;
    const radioBusqueda = Math.max(RADIO_BUSQUEDA_KM, distanciaCercana * 3);
    const dentroDelRadio = pool.filter(g => (g.distancia ?? Infinity) <= radioBusqueda);

    const masBarataCerca = dentroDelRadio
      .sort((a, b) => (a.precios[tipo] ?? Infinity) - (b.precios[tipo] ?? Infinity))[0] ?? null;

    this.construirResultado(masCercana, masBarataCerca, tipo, precioMedio);
  }

  /**
   * Comparación por coordenadas: cuando no hay geolocalización pero
   * la localidad tiene pocas gasolineras. Usa la posición de la gasolinera
   * filtrada como "centro" y busca más baratas en el dataset completo.
   */
  private calcularConCoordenadas(
    filtradas: GasolineraSimplificada[],
    tipo: keyof GasolineraSimplificada['precios'],
    precioMedio: number
  ): void {
    // Tomar la primera gasolinera filtrada como referencia
    const referencia = filtradas[0];
    if (!referencia || !referencia.latitud || !referencia.longitud) {
      this.calcularSinUbicacion(filtradas, tipo, precioMedio);
      return;
    }

    const centroLat = referencia.latitud;
    const centroLng = referencia.longitud;

    // Buscar en TODAS las gasolineras cargadas las que estén cerca
    const cercanas: (GasolineraSimplificada & { _distCalc: number })[] = [];
    const idsEnFiltro = new Set(filtradas.map(g => g.id));

    for (const g of this.todasGasolineras) {
      if (!g.precios[tipo] || g.precios[tipo]! <= 0) continue;
      if (!g.latitud || !g.longitud) continue;

      const dist = this.haversine(centroLat, centroLng, g.latitud, g.longitud);
      if (dist <= RADIO_BUSQUEDA_KM) {
        cercanas.push({ ...g, _distCalc: dist });
      }
    }

    if (cercanas.length <= 1) {
      // No hay nada cerca, mostrar solo info de precio medio
      this.calcularSinUbicacion(filtradas, tipo, precioMedio);
      return;
    }

    // La "más cercana" es la propia referencia (dist ~0)
    const masCercana = cercanas.reduce((c, g) => g._distCalc < c._distCalc ? g : c);

    // La más barata cercana
    const masBarataCerca = cercanas
      .sort((a, b) => (a.precios[tipo] ?? Infinity) - (b.precios[tipo] ?? Infinity))[0];

    if (masCercana.id === masBarataCerca.id) {
      // La más cercana ya es la más barata
      this.comparacion = {
        masCercana, masBarataCerca: masCercana,
        costeCercana: (masCercana.precios[tipo] ?? 0) * this.litros,
        costeBarataCerca: (masCercana.precios[tipo] ?? 0) * this.litros,
        distanciaExtra: 0, costeCombustibleExtra: 0, ahorroNeto: 0, precioMedio
      };
      return;
    }

    // Calcular distancia entre las dos
    const distanciaExtra = Math.max(0, masBarataCerca._distCalc - masCercana._distCalc);
    const precioCercana = masCercana.precios[tipo] ?? 0;
    const precioBarata = masBarataCerca.precios[tipo] ?? 0;

    const kmExtraIdaVuelta = distanciaExtra * 2;
    const litrosExtra = (kmExtraIdaVuelta * this.consumo) / 100;
    const costeCombustibleExtra = litrosExtra * precioBarata;

    const costeCercana = precioCercana * this.litros;
    const costeBarataCerca = precioBarata * this.litros;
    const ahorroNeto = (costeCercana - costeBarataCerca) - costeCombustibleExtra;

    // Asignar la distancia calculada para que el template la muestre
    masCercana.distancia = Math.round(masCercana._distCalc * 10) / 10;
    masBarataCerca.distancia = Math.round(masBarataCerca._distCalc * 10) / 10;

    this.comparacion = {
      masCercana, masBarataCerca,
      costeCercana, costeBarataCerca,
      distanciaExtra, costeCombustibleExtra, ahorroNeto, precioMedio
    };
  }

  /** Modo sin ubicación con suficientes resultados: más barata vs más cara */
  private calcularSinUbicacion(
    conPrecio: GasolineraSimplificada[],
    tipo: keyof GasolineraSimplificada['precios'],
    precioMedio: number
  ): void {
    const masBarataVisible = conPrecio.length > 0 ? conPrecio[0] : null;
    const masCaraVisible = conPrecio.length > 1 ? conPrecio[conPrecio.length - 1] : null;

    if (masBarataVisible && masCaraVisible && masBarataVisible.id !== masCaraVisible.id) {
      this.comparacion = {
        masCercana: masCaraVisible,
        masBarataCerca: masBarataVisible,
        costeCercana: (masCaraVisible.precios[tipo] ?? 0) * this.litros,
        costeBarataCerca: (masBarataVisible.precios[tipo] ?? 0) * this.litros,
        distanciaExtra: 0, costeCombustibleExtra: 0,
        ahorroNeto: ((masCaraVisible.precios[tipo] ?? 0) - (masBarataVisible.precios[tipo] ?? 0)) * this.litros,
        precioMedio
      };
    } else {
      this.comparacion = {
        masCercana: null, masBarataCerca: masBarataVisible ?? null,
        costeCercana: 0,
        costeBarataCerca: masBarataVisible ? (masBarataVisible.precios[tipo] ?? 0) * this.litros : 0,
        distanciaExtra: 0, costeCombustibleExtra: 0, ahorroNeto: 0, precioMedio
      };
    }
  }

  /** Construye el resultado final para el modo con ubicación */
  private construirResultado(
    masCercana: GasolineraSimplificada,
    masBarataCerca: GasolineraSimplificada | null,
    tipo: keyof GasolineraSimplificada['precios'],
    precioMedio: number
  ): void {
    if (!masBarataCerca || masCercana.id === masBarataCerca.id) {
      this.comparacion = {
        masCercana, masBarataCerca: masCercana,
        costeCercana: (masCercana.precios[tipo] ?? 0) * this.litros,
        costeBarataCerca: (masCercana.precios[tipo] ?? 0) * this.litros,
        distanciaExtra: 0, costeCombustibleExtra: 0, ahorroNeto: 0, precioMedio
      };
      return;
    }

    const precioCercana = masCercana.precios[tipo] ?? 0;
    const precioBarata = masBarataCerca.precios[tipo] ?? 0;
    const costeCercana = precioCercana * this.litros;
    const costeBarataCerca = precioBarata * this.litros;
    const distanciaExtra = Math.max(0, (masBarataCerca.distancia ?? 0) - (masCercana.distancia ?? 0));

    const kmExtraIdaVuelta = distanciaExtra * 2;
    const litrosExtra = (kmExtraIdaVuelta * this.consumo) / 100;
    const costeCombustibleExtra = litrosExtra * precioBarata;
    const ahorroNeto = (costeCercana - costeBarataCerca) - costeCombustibleExtra;

    this.comparacion = {
      masCercana, masBarataCerca,
      costeCercana, costeBarataCerca,
      distanciaExtra, costeCombustibleExtra, ahorroNeto, precioMedio
    };
  }

  private crearComparacionVacia(precioMedio: number): ComparacionAhorro {
    return {
      masCercana: null, masBarataCerca: null,
      costeCercana: 0, costeBarataCerca: 0,
      distanciaExtra: 0, costeCombustibleExtra: 0, ahorroNeto: 0, precioMedio
    };
  }

  /** Fórmula de Haversine: distancia en km entre dos coordenadas */
  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  calcularCosteTotal(precio: number | undefined): string {
    if (!precio) return 'N/D';
    return (precio * this.litros).toFixed(2);
  }

  calcularAhorroVsMedia(precio: number | undefined): number | null {
    if (!precio || !this.comparacion?.precioMedio) return null;
    return (this.comparacion.precioMedio - precio) * this.litros;
  }
}
