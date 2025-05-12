import cors from 'cors';
import express from 'express';
import { register } from '../generated';
import { docs } from './docs';
import { configuireLogger } from './logger';
import { events } from './events';
import { connectToDatabase } from './db';

const PORT = process.env.PORT ?? 5500;

const app = express();
app.use(cors());

const [logHandler, logger] = configuireLogger();
app.use(logHandler);

// MongoDB
connectToDatabase()
  .then(() => logger.info('Connected to db'))
  .catch((err) => {
    logger.error('Failed to connect to db', err);
    process.exit(1);
  });

// serve openapi schema.json and docs frontend
app.use('/docs', docs);

// register all services implementation in api spec
register(app, { events });

app.listen(PORT);
logger.info('Server is running', { port: `${PORT}` });
