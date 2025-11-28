import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { UniswapClmmSimulateSwapRequest, UniswapClmmSimulateSwapResponse } from '../schemas';
import { Token, TradeType } from '@uniswap/sdk-core';
import { Pool, Trade as V3Trade } from '@uniswap/v3-sdk';
import { getUniswapClmmQuote } from './quoteSwap';

async function simulateSwap(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL',
  slippagePct?: number
): Promise<Static<typeof UniswapClmmSimulateSwapResponse>> {
  const uniswap = await Uniswap.getInstance(network);

  const { quote, baseTokenObj, quoteTokenObj } = await getUniswapClmmQuote(
    fastify,
    network,
    poolAddress,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    slippagePct
  );

  const trade: V3Trade<Token, Token, TradeType> = quote.trade;

  let finalPrice = parseFloat(trade.executionPrice.toSignificant(15));
  try {
    const pool: Pool | null = await uniswap.getV3Pool(baseTokenObj, quoteTokenObj, undefined, poolAddress);
    if (pool) {
      const [, poolAfter] =
        side === 'SELL'
          ? await pool.getOutputAmount(trade.inputAmount)
          : await pool.getInputAmount(trade.outputAmount);

      const inputIsToken0 = trade.inputAmount.currency.equals(pool.token0);
      finalPrice = inputIsToken0
        ? parseFloat(poolAfter.token1Price.toSignificant(15))
        : parseFloat(poolAfter.token0Price.toSignificant(15));
    }
  } catch (err) {
    logger.warn(`Failed to derive post-swap price from pool state, falling back to executionPrice: ${err.message}`);
  }

  return {
    poolAddress,
    tokenIn: quote.inputToken.address,
    tokenOut: quote.outputToken.address,
    amountIn: quote.estimatedAmountIn,
    amountOut: quote.estimatedAmountOut,
    price: quote.estimatedAmountIn > 0 ? quote.estimatedAmountOut / quote.estimatedAmountIn : 0,
    slippagePct: slippagePct || uniswap.config.slippagePct,
    minAmountOut: quote.minAmountOut,
    maxAmountIn: quote.maxAmountIn,
    priceImpactPct: quote.priceImpact,
    finalPrice,
  };
}

export const simulateSwapRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UniswapClmmSimulateSwapRequest>;
    Reply: Static<typeof UniswapClmmSimulateSwapResponse>;
  }>(
    '/simulate-swap',
    {
      schema: {
        description:
          'Simulate a swap on Uniswap V3 to get the estimated final price in the pool after the transaction.',
        tags: ['/connector/uniswap'],
        querystring: UniswapClmmSimulateSwapRequest,
        response: {
          200: UniswapClmmSimulateSwapResponse,
        },
      },
    },
    async (request) => {
      try {
        const { network, poolAddress, baseToken, quoteToken, amount, side, slippagePct } = request.query;

        if (!poolAddress && (!baseToken || !quoteToken)) {
          throw fastify.httpErrors.badRequest('Either poolAddress or both baseToken and quoteToken must be provided.');
        }
        
        let poolAddressToUse = poolAddress;
        if (!poolAddressToUse) {
            const uniswap = await Uniswap.getInstance(network);
            poolAddressToUse = await uniswap.findDefaultPool(baseToken, quoteToken, 'clmm');
            if (!poolAddressToUse) {
                throw fastify.httpErrors.notFound(`No CLMM pool found for pair ${baseToken}-${quoteToken}`);
            }
        }

        return await simulateSwap(
          fastify,
          network,
          poolAddressToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL',
          slippagePct
        );
      } catch (e) {
        logger.error(`Simulate swap failed: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to simulate swap.');
      }
    }
  );
};
