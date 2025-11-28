import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { JupiterSimulateSwapRequest, JupiterSimulateSwapResponse } from '../schemas';
import { quoteSwap } from './quoteSwap';
import { JupiterConfig } from '../jupiter.config';

async function simulateSwap(
  fastify: FastifyInstance,
  network: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL'
): Promise<Static<typeof JupiterSimulateSwapResponse>> {
  const quote = await quoteSwap(
    fastify,
    network,
    baseToken,
    quoteToken,
    amount,
    side,
    JupiterConfig.config.slippagePct
  );

  // For an aggregator like Jupiter, the concept of a single pool's "final price"
  // doesn't directly apply as the swap may be routed through multiple pools.
  // The most useful "final price" in this context is the effective price of the swap.
  const finalPrice = quote.price;

  return {
    tokenIn: quote.tokenIn,
    tokenOut: quote.tokenOut,
    amountIn: quote.amountIn,
    amountOut: quote.amountOut,
    price: quote.price,
    priceImpactPct: quote.priceImpactPct,
    finalPrice: finalPrice,
  };
}

export const simulateSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof JupiterSimulateSwapRequest>;
    Reply: Static<typeof JupiterSimulateSwapResponse>;
  }>(
    '/simulate-swap',
    {
      schema: {
        description: 'Simulate a swap on Jupiter to get the effective price and price impact.',
        tags: ['/connector/jupiter'],
        querystring: JupiterSimulateSwapRequest,
        response: {
          200: JupiterSimulateSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, baseToken, quoteToken, amount, side } = request.query;

        return await simulateSwap(fastify, network, baseToken, quoteToken, amount, side as 'BUY' | 'SELL');
      } catch (e) {
        logger.error(`Simulate Jupiter swap failed: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to simulate Jupiter swap.');
      }
    }
  );
};
