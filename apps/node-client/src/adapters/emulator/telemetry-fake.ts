import type { Telemetry, TelemetryData } from '../../interfaces/telemetry.js';

function rand(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

export class FakeTelemetry implements Telemetry {
  async read(): Promise<TelemetryData> {
    return {
      cpu: rand(8, 35),
      ram: rand(250, 380),
      temp: rand(38, 52),
      wifi: rand(-70, -30),
      battery: 100,
    };
  }
}
