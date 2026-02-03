import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'precios'
})
export class PreciosPipe implements PipeTransform {
  transform(value: number | undefined): string {
    if (value === undefined || value === null) {
      return 'N/D';
    }
    return value.toFixed(3);
  }
}
