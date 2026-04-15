import { AfterViewInit, Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
  title = 'Precios Combustibles';
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
