import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { GasolineraSimplificada } from '../../models/gasolinera.model';
import { FavoritosService } from '../../services/favoritos.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-tarjeta-gasolinera',
  templateUrl: './tarjeta-gasolinera.component.html',
  styleUrls: ['./tarjeta-gasolinera.component.scss']
})
export class TarjetaGasolineraComponent implements OnInit, OnDestroy {
  @Input() gasolinera!: GasolineraSimplificada;
  @Input() combustibleDestacado: keyof GasolineraSimplificada['precios'] = 'diesel';
  
  mostrarDetalles = false;
  esFavorito = false;
  
  private destroy$ = new Subject<void>();

  constructor(private favoritosService: FavoritosService) {}

  ngOnInit(): void {
    // Verificar si es favorito al cargar
    this.actualizarEstadoFavorito();
    
    // Escuchar cambios en favoritos
    this.favoritosService.getFavoritos()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.actualizarEstadoFavorito());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleDetalles(): void {
    this.mostrarDetalles = !this.mostrarDetalles;
  }

  obtenerPrecioDestacado(): number | undefined {
    return this.gasolinera.precios[this.combustibleDestacado];
  }

  abrirMaps(): void {
    const url = `https://www.google.com/maps/search/?api=1&query=${this.gasolinera.latitud},${this.gasolinera.longitud}`;
    window.open(url, '_blank');
  }

  toggleFavorito(): void {
    this.favoritosService.toggleFavorito(this.gasolinera);
  }

  private actualizarEstadoFavorito(): void {
    this.esFavorito = this.favoritosService.esFavorito(this.gasolinera.id);
  }
}
