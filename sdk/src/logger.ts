import winston from 'winston';
import LokiTransport from 'winston-loki';

export interface Logger {
  debug: (message: string, ...meta: any[]) => void;
  info: (message: string, ...meta: any[]) => void;
  warn: (message: string, ...meta: any[]) => void;
  error: (message: string, ...meta: any[]) => void;
}

export class MockLogger implements Logger {
  debug(m: string, ...meta: any[]) {}
  info(m: string, ...meta: any[]) {}
  warn(m: string, ...meta: any[]) {}
  error(m: string, ...meta: any[]) {}
}

export class ConsoleLogger implements Logger {
  debug = console.debug;
  info = console.log;
  warn = console.warn;
  error = console.error;
}

export class WinstonLogger implements Logger {
  logger: winston.Logger;
  private lokiTransport?: LokiTransport;

  constructor(name: string, defaultMeta: { [key: string]: string } = {}, catchConsoleLogs = true) {
    let format: winston.Logform.Format;
    let level = 'info';

    if (process.env.NODE_ENV !== 'production') {
      level = 'debug';
      format = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize(),
        winston.format.simple(),
      );
    } else {
      format = winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.json(),
      );
    }

    this.logger = winston.createLogger({
      level,
      format,
      defaultMeta: { name, ...defaultMeta },
      transports: [new winston.transports.Console()],
    });

    if (catchConsoleLogs) {
      console.debug = this.debug;
      console.info = this.info;
      console.warn = this.warn;
      console.error = this.error;
    }
  }

  withLokiTransport(host: string): WinstonLogger {
    this.lokiTransport = new LokiTransport({
      host,
      json: true,
      useWinstonMetaAsLabels: true,
      ignoredMeta: ['imageBuild'],
      format: this.logger.format,
      batching: true,
      timeout: 15_000,
      onConnectionError: (error) => {
        this.logger.error('Loki connection error:', { error: `${error}` });
      },
    });
    this.logger.add(this.lokiTransport);
    this.logger.debug('Loki transport added', { host });
    return this;
  }

  debug = (m: string, ...meta: any[]) => this.logger.debug(m, ...meta);
  info = (m: string, ...meta: any[]) => this.logger.info(m, ...meta);
  warn = (m: string, ...meta: any[]) => this.logger.warn(m, ...meta);
  error = (m: string, ...meta: any[]) => this.logger.error(m, ...meta);

  addMetaField(key: string, value: string) {
    this.logger.defaultMeta[key] = value;
  }

  async flush() {
    await this.lokiTransport?.flush();
  }
}
