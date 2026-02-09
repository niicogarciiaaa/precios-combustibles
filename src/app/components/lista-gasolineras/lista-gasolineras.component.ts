import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { GasolinerasService } from '../../services/gasolineras.service';
import { FavoritosService } from '../../services/favoritos.service';
import { GasolineraSimplificada, TipoCombustible } from '../../models/gasolinera.model';

@Component({
  selector: 'app-lista-gasolineras',
  templateUrl: './lista-gasolineras.component.html',
  styleUrls: ['./lista-gasolineras.component.scss']
})
export class ListaGasolinerasComponent implements OnInit, OnDestroy {
  gasolineras: GasolineraSimplificada[] = [];
  gasolinerasFiltradas: GasolineraSimplificada[] = [];
  favoritos: GasolineraSimplificada[] = [];
  provincias: string[] = [];
  localidades: string[] = [];
  loading = true;
  error: string | null = null;
  ubicacionUsuario: { lat: number; lng: number } | null = null;
  mostrandoCercanas = false;
  mostrarFavoritos = false;
  numeroFavoritos = 0;
  
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
          this.gasolineras = gasolineras;
          this.extraerProvinciasYLocalidades();
          this.aplicarFiltros();
          this.loading = false;
        },
        error: (err) => {
          console.error('Error al cargar gasolineras:', err);
          this.error = 'Error al cargar los datos. Por favor, intenta de nuevo más tarde.';
          this.loading = false;
        }
      });
  }

  extraerProvinciasYLocalidades(): void {
    const provinciasSet = new Set<string>();
    const localidadesSet = new Set<string>();

    this.gasolineras.forEach(g => {
      if (g.provincia) provinciasSet.add(g.provincia);
      if (g.localidad) localidadesSet.add(g.localidad);
    });

    this.provincias = Array.from(provinciasSet).sort();
    this.localidades = Array.from(localidadesSet).sort();
  }

  aplicarFiltros(): void {
    let resultado = [...this.gasolineras];

    if (this.filtros.provincia) {
      resultado = resultado.filter(g => 
        g.provincia.toLowerCase().includes(this.filtros.provincia.toLowerCase())
      );
    }

    if (this.filtros.localidad) {
      resultado = resultado.filter(g => 
        g.localidad.toLowerCase().includes(this.filtros.localidad.toLowerCase())
      );
    }

    if (this.filtros.codigoPostal) {
      resultado = resultado.filter(g => 
        g.codigoPostal.includes(this.filtros.codigoPostal)
      );
    }

    // Ordenar por precio del combustible seleccionado
    resultado = resultado.sort((a, b) => {
      const precioA = a.precios[this.filtros.tipoCombustible] || Infinity;
      const precioB = b.precios[this.filtros.tipoCombustible] || Infinity;
      return precioA - precioB;
    });

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
    const gasolinerasConDistancia = this.gasolineras
      .map(g => ({
        ...g,
        distancia: this.calcularDistancia(
          this.ubicacionUsuario!.lat,
          this.ubicacionUsuario!.lng,
          g.latitud,
          g.longitud
        )
      }))
      .sort((a, b) => a.distancia - b.distancia);

    this.gasolinerasFiltradas = gasolinerasConDistancia as any;
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
    this.cargarGasolineras();
  }

  limpiarFavoritos(): void {
    if (confirm('¿Estás seguro de que quieres eliminar todos los favoritos?')) {
      this.favoritosService.limpiarFavoritos();
    }
  }

  trackByFn(index: number, item: GasolineraSimplificada): string {
    return item.id;
  }
}
