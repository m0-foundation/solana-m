import LokiTransport from 'winston-loki';
import winston from 'winston';

export const getLokiTransport = (host: string, logger: winston.Logger) =>
  new LokiTransport({
    host,
    json: true,
    useWinstonMetaAsLabels: true,
    ignoredMeta: ['imageBuild'],
    format: logger.format,
    batching: true,
    timeout: 15_000,
    onConnectionError: (error: any) => {
      logger.error('Loki connection error:', { error: `${error}` });
    },
  });
