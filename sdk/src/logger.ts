import winston from 'winston';

export interface Logger {
  info: (message: string, ...meta: any[]) => void;
  warn: (message: string, ...meta: any[]) => void;
  error: (message: string, ...meta: any[]) => void;
}

export class EmptyLogger implements Logger {
  info(m: string, ...meta: any[]) {}
  warn(m: string, ...meta: any[]) {}
  error(m: string, ...meta: any[]) {}
}

export class ConsoleLogger implements Logger {
  info = console.log;
  warn = console.warn;
  error = console.error;
}

export class WinstonLogger implements Logger {
  private logger: winston.Logger;

  constructor(name: string, level: 'info', defaultMeta: { [key: string]: string }, catchConsoleLogs = true) {
    let format: winston.Logform.Format;

    if (process.env.NODE_ENV !== 'production') {
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
  }

  info(m: string, ...meta: any[]) {
    this.logger.info(m, ...meta);
  }
  warn(m: string, ...meta: any[]) {
    this.logger.warn(m, ...meta);
  }
  error(m: string, ...meta: any[]) {
    this.logger.error(m, ...meta);
  }

  catchConsoleLogs() {
    const parser =
      (lgr: (message: string, ...meta: any[]) => void) =>
      (message?: any, ...optionalParams: any[]) => {
        lgr(message ?? 'console log', {
          params: optionalParams,
        });
      };

    console.info = parser((message: string, ...meta: any[]) => this.info(message, ...meta));
    console.warn = parser((message: string, ...meta: any[]) => this.warn(message, ...meta));
    console.error = parser((message: string, ...meta: any[]) => this.error(message, ...meta));
  }
}
