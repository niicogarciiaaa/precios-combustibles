import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { GasolineraSimplificada } from '../../models/gasolinera.model';
import { FavoritosService } from '../../services/favoritos.service';

@Component({
  selector: 'app-tarjeta-gasolinera',
  templateUrl: './tarjeta-gasolinera.component.html',
  styleUrls: ['./tarjeta-gasolinera.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TarjetaGasolineraComponent {
  @Input() gasolinera!: GasolineraSimplificada;
  @Input() combustibleDestacado: keyof GasolineraSimplificada['precios'] = 'diesel';
  @Input() esFavorito = false;
  @Input() litrosRepostar = 0; // 0 = no mostrar info de coste
  @Input() precioMedio = 0;    // precio medio del combustible seleccionado

  mostrarDetalles = false;

  constructor(private favoritosService: FavoritosService) {}

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

  get costeTotal(): number | null {
    if (this.litrosRepostar <= 0) return null;
    const precio = this.obtenerPrecioDestacado();
    if (!precio) return null;
    return precio * this.litrosRepostar;
  }

  get ahorroVsMedia(): number | null {
    if (this.litrosRepostar <= 0 || this.precioMedio <= 0) return null;
    const precio = this.obtenerPrecioDestacado();
    if (!precio) return null;
    return (this.precioMedio - precio) * this.litrosRepostar;
  }
}
