import * as os from 'node:os';
import type { Telemetry, TelemetryData } from '../../interfaces/telemetry.js';

export class NativeTelemetry implements Telemetry {
  async read(): Promise<TelemetryData> {
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, c) => acc + c.times.idle, 0);
    const totalTick = cpus.reduce((acc, c) => acc + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq, 0);
    const cpu = Math.round((1 - totalIdle / totalTick) * 100);
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ram = Math.round((totalMem - freeMem) / 1024 / 1024);

    return { cpu, ram, temp: 0, wifi: 0, battery: 100 };
  }
}
