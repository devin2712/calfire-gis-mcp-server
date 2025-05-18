import { handle } from '@hono/aws-lambda';
import { app } from './dist/index.js';

export const handler = handle(app); 