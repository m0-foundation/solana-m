import cors from 'cors';
import express from 'express';
import { register } from './generated';
import { EventsService } from './generated/api/resources/events/service/EventsService';
import { docs } from './docs';
import { configuireLogger } from './logger';

const PORT = process.env.PORT ?? 5500;

const events = new EventsService({
  bridges(req, res, next) {},
});

const app = express();
app.use(cors());
app.use(configuireLogger());

// serve openapi schema.json and docs frontend
app.use('/docs', docs);

// register all services implementation in api spec
register(app, { events });

app.listen(PORT);
console.log(`Server is running on port ${PORT}`);
