import { M0Api } from './generated';
import cors from 'cors';
import express from 'express';
import { register } from './generated';
import { EventsService } from './generated/api/resources/events/service/EventsService';

const events = new EventsService({
  bridges(req, res, next) {},
});

const PORT = process.env.PORT ?? 8080;

const app = express();
app.use(cors());

register(app, {
  events,
});

app.listen(PORT);
console.log(`🎉 Listening on port ${PORT}...`);
