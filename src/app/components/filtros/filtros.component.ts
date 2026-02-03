import { Component, EventEmitter, Output, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-filtros',
  templateUrl: './filtros.component.html',
  styleUrls: ['./filtros.component.scss']
})
export class FiltrosComponent implements OnChanges {
  @Output() filtrosChange = new EventEmitter<any>();
  @Output() buscarCercanas = new EventEmitter<void>();
  @Input() provincias: string[] = [];
  @Input() localidades: string[] = [];
  @Input() todasLasGasolineras: any[] = [];

  localidadesFiltradas: string[] = [];
  buscandoUbicacion = false;

  filtros = {
    provincia: '',
    localidad: '',
    codigoPostal: '',
    tipoCombustible: 'diesel'
  };

  tiposCombustible = [
    { value: 'gasolina95', label: 'Gasolina 95' },
    { value: 'gasolina98', label: 'Gasolina 98' },
    { value: 'diesel', label: 'Diésel' },
    { value: 'dieselPremium', label: 'Diésel Premium' },
    { value: 'glp', label: 'GLP' },
    { value: 'gnc', label: 'GNC' },
    { value: 'bioetanol', label: 'Bioetanol' },
    { value: 'biodiesel', label: 'Biodiésel' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['localidades'] && this.localidades) {
      this.localidadesFiltradas = [...this.localidades];
    }
  }

  onProvinciaChange(): void {
    // Resetear localidad cuando cambia la provincia
    this.filtros.localidad = '';
    
    // Filtrar localidades de la provincia seleccionada
    if (this.filtros.provincia && this.todasLasGasolineras.length > 0) {
      const localidadesSet = new Set<string>();
      this.todasLasGasolineras
        .filter(g => g.provincia === this.filtros.provincia)
        .forEach(g => {
          if (g.localidad) localidadesSet.add(g.localidad);
        });
      this.localidadesFiltradas = Array.from(localidadesSet).sort();
    } else {
      this.localidadesFiltradas = [...this.localidades];
    }
    
    this.onFiltroChange();
  }

  onFiltroChange(): void {
    this.filtrosChange.emit(this.filtros);
  }

  limpiarFiltros(): void {
    this.filtros = {
      provincia: '',
      localidad: '',
      codigoPostal: '',
      tipoCombustible: 'diesel'
    };
    this.localidadesFiltradas = [...this.localidades];
    this.filtrosChange.emit(this.filtros);
  }

  onBuscarCercanas(): void {
    this.buscarCercanas.emit();
  }
}
