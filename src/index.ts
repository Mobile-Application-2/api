import {config} from 'dotenv';
config();

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import generalRoutes from './routes/general.routes';

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());

const PORT = process.env.PORT || 5656;
const DB_URI = process.env.DB_URI;

async function main() {
  console.log('Connecting to DB');
  await mongoose.connect(DB_URI as string);
  console.log('DB connection established');

  app.use('', generalRoutes);

  app.get('*', (_, res) => {
    res.status(404).json({message: 'Route not found'});
  });

  app.listen(PORT, () => console.log('App is now running'));
}

main().catch(console.error);
