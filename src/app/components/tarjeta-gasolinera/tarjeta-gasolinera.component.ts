import { Component, Input } from '@angular/core';
import { GasolineraSimplificada } from '../../models/gasolinera.model';

@Component({
  selector: 'app-tarjeta-gasolinera',
  templateUrl: './tarjeta-gasolinera.component.html',
  styleUrls: ['./tarjeta-gasolinera.component.scss']
})
export class TarjetaGasolineraComponent {
  @Input() gasolinera!: GasolineraSimplificada;
  @Input() combustibleDestacado: keyof GasolineraSimplificada['precios'] = 'diesel';
  
  mostrarDetalles = false;

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
}
