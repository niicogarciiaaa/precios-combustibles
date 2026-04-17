import { AfterViewInit, Component } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
  title = 'Precios Combustibles';

  constructor(private meta: Meta, private titleService: Title) {
    this.titleService.setTitle('Precios Combustibles España — Gasolineras Baratas en Tiempo Real');
    this.meta.updateTag({ name: 'description', content: 'Compara precios de gasolina y diésel en todas las gasolineras de España. Datos oficiales del MITECO actualizados en tiempo real. Encuentra la gasolinera más barata cerca de ti.' });
  }
  mostrarAyuda = false;

  toggleAyuda(): void {
    this.mostrarAyuda = !this.mostrarAyuda;
  }

  cerrarAyuda(): void {
    this.mostrarAyuda = false;
  }

  ngAfterViewInit(): void {
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (error) {
      // ignore
    }
  }
}
