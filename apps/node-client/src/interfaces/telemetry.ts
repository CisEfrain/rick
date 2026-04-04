export interface TelemetryData {
  cpu: number;
  ram: number;
  temp: number;
  wifi: number;
  battery: number;
}

/**
 * Información de estado del hardware.
 * Pi: vcgencmd, /proc/meminfo, etc.
 * Emulador: valores simulados.
 */
export interface Telemetry {
  read(): Promise<TelemetryData>;
}
