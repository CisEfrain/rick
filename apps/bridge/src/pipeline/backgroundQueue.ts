import { logger } from '../common/logger.js';

interface BackgroundTask {
  tool: string;
  args: any;
  timestamp: number;
}

interface CompletedTask {
  tool: string;
  result: any;
  completedAt: number;
}

export class BackgroundQueue {
  private pending: BackgroundTask[] = [];
  private completed: CompletedTask[] = [];
  private processing = false;

  enqueue(task: BackgroundTask): void {
    logger.info('bg_queue.enqueued', { tool: task.tool });
    this.pending.push(task);
    if (!this.processing) this.processNext();
  }

  dequeue(): CompletedTask | null {
    return this.completed.shift() || null;
  }

  get hasPending(): boolean {
    return this.completed.length > 0;
  }

  private async processNext(): Promise<void> {
    if (this.pending.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const task = this.pending.shift()!;

    try {
      const result = await this.executeAsync(task);
      this.completed.push({
        tool: task.tool,
        result,
        completedAt: Date.now(),
      });
      logger.info('bg_queue.completed', { tool: task.tool });
    } catch (err: any) {
      this.completed.push({
        tool: task.tool,
        result: { error: String(err) },
        completedAt: Date.now(),
      });
      logger.error('bg_queue.error', { tool: task.tool, message: err.message });
    }

    this.processNext();
  }

  private async executeAsync(task: BackgroundTask): Promise<any> {
    switch (task.tool) {
      case 'mover':
        // Future: send motor command to Node Client via WebSocket
        // For now, simulate the movement completing after a short delay
        return {
          status: 'completado',
          direccion: task.args.direccion,
          duracion_ms: task.args.duracion_ms || 1000,
        };

      case 'poner_alarma':
        // Schedule a timer that, when it fires, pushes a completed task
        // so the pipeline can generate a proactive message
        const minutos = task.args.minutos;
        const mensaje = task.args.mensaje;

        setTimeout(() => {
          this.completed.push({
            tool: 'alarma_sonando',
            result: { mensaje },
            completedAt: Date.now(),
          });
          logger.info('bg_queue.alarm_fired', { mensaje, minutos });
        }, minutos * 60 * 1000);

        return { status: 'alarma_programada', minutos, mensaje };

      default:
        return { error: `Tool async desconocida: ${task.tool}` };
    }
  }
}
