// Modelo para una estación de servicio (gasolinera)
export interface Gasolinera {
  'IDEESS': string;  // ID de la estación
  'Rótulo': string;  // Nombre de la marca
  'Dirección': string;
  'Localidad': string;
  'Provincia': string;
  'C.P.': string;  // Código postal
  'Latitud': string;
  'Longitud (WGS84)': string;
  'Horario': string;
  
  // Precios de combustibles
  'Precio Gasolina 95 E5': string;
  'Precio Gasolina 98 E5': string;
  'Precio Gasoleo A': string;
  'Precio Gasoleo Premium': string;
  'Precio Bioetanol': string;
  'Precio Biodiesel': string;
  'Precio Gas Natural Comprimido': string;
  'Precio Gas Natural Licuado': string;
  'Precio Gases licuados del petróleo': string;
}

// Respuesta de la API del MITECO
export interface ApiResponse {
  Fecha: string;
  ListaEESSPrecio: Gasolinera[];
  Nota: string;
  ResultadoConsulta: string;
}

// Modelo simplificado para mostrar en la UI
export interface GasolineraSimplificada {
  id: string;
  nombre: string;
  direccion: string;
  localidad: string;
  provincia: string;
  codigoPostal: string;
  horario: string;
  latitud: number;
  longitud: number;
  precios: PreciosCombustible;
  distancia?: number; // Distancia en km desde la ubicación del usuario
}

export interface PreciosCombustible {
  gasolina95?: number;
  gasolina98?: number;
  diesel?: number;
  dieselPremium?: number;
  glp?: number;
  gnc?: number;
  bioetanol?: number;
  biodiesel?: number;
}

export type TipoCombustible = 
  'gasolina95' | 
  'gasolina98' | 
  'diesel' | 
  'dieselPremium' | 
  'glp' | 
  'gnc' | 
  'bioetanol' | 
  'biodiesel';
