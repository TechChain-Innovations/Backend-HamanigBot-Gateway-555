import { FastifyPluginAsync } from 'fastify';

import executeQuoteRoute from './executeQuote';
import executeSwapRoute from './executeSwap';
import quoteSwapRoute from './quoteSwap';
import { simulateSwapRoute } from './simulateSwap';

export const jupiterRouterRoutes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(quoteSwapRoute);
  await fastify.register(executeQuoteRoute);
  await fastify.register(executeSwapRoute);
  await fastify.register(simulateSwapRoute);
};

export default jupiterRouterRoutes;
