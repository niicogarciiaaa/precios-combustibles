import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { GasolineraSimplificada } from '../models/gasolinera.model';

@Injectable({
  providedIn: 'root'
})
export class FavoritosService {
  private readonly STORAGE_KEY = 'gasolineras_favoritos';
  private favoritos$ = new BehaviorSubject<GasolineraSimplificada[]>(this.cargarDelStorage());

  constructor() {}

  /**
   * Obtiene los favoritos como Observable
   */
  getFavoritos(): Observable<GasolineraSimplificada[]> {
    return this.favoritos$.asObservable();
  }

  /**
   * Obtiene los favoritos actuales de forma síncrona
   */
  getFavoritosActuales(): GasolineraSimplificada[] {
    return this.favoritos$.value;
  }

  /**
   * Agrega una gasolinera a favoritos
   */
  agregarFavorito(gasolinera: GasolineraSimplificada): void {
    const favoritos = this.favoritos$.value;
    if (!this.esFavorito(gasolinera.id)) {
      const nuevosFavoritos = [...favoritos, gasolinera];
      this.favoritos$.next(nuevosFavoritos);
      this.guardarEnStorage(nuevosFavoritos);
    }
  }

  /**
   * Elimina una gasolinera de favoritos
   */
  eliminarFavorito(id: string): void {
    const favoritos = this.favoritos$.value.filter(g => g.id !== id);
    this.favoritos$.next(favoritos);
    this.guardarEnStorage(favoritos);
  }

  /**
   * Verifica si una gasolinera está en favoritos
   */
  esFavorito(id: string): boolean {
    return this.favoritos$.value.some(g => g.id === id);
  }

  /**
   * Alterna el estado de favorito
   */
  toggleFavorito(gasolinera: GasolineraSimplificada): void {
    if (this.esFavorito(gasolinera.id)) {
      this.eliminarFavorito(gasolinera.id);
    } else {
      this.agregarFavorito(gasolinera);
    }
  }

  /**
   * Limpia todos los favoritos
   */
  limpiarFavoritos(): void {
    this.favoritos$.next([]);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  /**
   * Carga los favoritos del localStorage
   */
  private cargarDelStorage(): GasolineraSimplificada[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error al cargar favoritos del storage:', error);
      return [];
    }
  }

  /**
   * Guarda los favoritos en localStorage
   */
  private guardarEnStorage(favoritos: GasolineraSimplificada[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(favoritos));
    } catch (error) {
      console.error('Error al guardar favoritos en storage:', error);
    }
  }
}
