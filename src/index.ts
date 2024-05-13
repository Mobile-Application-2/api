import {config} from 'dotenv';
config();

import express from 'express';
import cors from 'cors';
import compression from 'compression';

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());

const PORT = process.env.PORT || 5656;

async function main() {
  app.get('', (_, res) => {
    res.status(200).json({message: 'App is running'});
  });

  app.listen(PORT, () => console.log('App is now running'));
}

main().catch(console.error);
