import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync } from 'fastify';

import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumAmmSimulateSwapRequest, RaydiumAmmSimulateSwapResponse } from '../schemas';
import { getRawSwapQuote } from './quoteSwap';
import Decimal from 'decimal.js';

async function simulateAmmSwap(
  network: string,
  poolAddress: string,
  baseToken: string,
  quoteToken: string,
  amount: number,
  side: 'BUY' | 'SELL'
): Promise<Static<typeof RaydiumAmmSimulateSwapResponse>> {
  const raydium = await Raydium.getInstance(network);
  const quote = await getRawSwapQuote(
    raydium,
    network,
    poolAddress,
    baseToken,
    quoteToken,
    amount,
    side
  );

  const inputToken = quote.inputToken;
  const outputToken = quote.outputToken;

  const estimatedAmountIn = new Decimal(quote.amountIn.toString()).div(10 ** inputToken.decimals);
  const estimatedAmountOut = new Decimal(quote.amountOut.toString()).div(10 ** outputToken.decimals);
  
  const price = estimatedAmountIn.gt(0) ? estimatedAmountOut.div(estimatedAmountIn) : new Decimal(0);

  const finalPrice = new Decimal(quote.afterPrice.toString());

  return {
    poolAddress,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn: estimatedAmountIn.toNumber(),
    amountOut: estimatedAmountOut.toNumber(),
    price: price.toNumber(),
    priceImpactPct: quote.priceImpact * 100,
    finalPrice: finalPrice.toNumber(),
  };
}

export const simulateSwapAmmRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof RaydiumAmmSimulateSwapRequest>;
    Reply: Static<typeof RaydiumAmmSimulateSwapResponse>;
  }>(
    '/simulate-swap',
    {
      schema: {
        description: 'Simulate a swap on Raydium AMM to get the estimated final price.',
        tags: ['/connector/raydium'],
        querystring: RaydiumAmmSimulateSwapRequest,
        response: {
          200: RaydiumAmmSimulateSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseToken, quoteToken, amount, side } = request.query;

        if (!poolAddress && (!baseToken || !quoteToken)) {
            throw fastify.httpErrors.badRequest('Either poolAddress or both baseToken and quoteToken must be provided.');
        }

        let poolAddressToUse = poolAddress;
        if (!poolAddressToUse) {
            const raydium = await Raydium.getInstance(network);
            poolAddressToUse = await raydium.findDefaultPool(baseToken, quoteToken, 'amm');
            if (!poolAddressToUse) {
                throw fastify.httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
            }
        }
        
        return await simulateAmmSwap(network, poolAddressToUse, baseToken, quoteToken, amount, side as 'BUY' | 'SELL');
      } catch (e) {
        logger.error(`Simulate AMM swap failed: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to simulate AMM swap.');
      }
    }
  );
};
