import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';

import { logger } from '../../../services/logger';
import { Uniswap } from '../uniswap';
import { UniswapAmmSimulateSwapRequest, UniswapAmmSimulateSwapResponse } from '../schemas';
import { Token, TradeType, CurrencyAmount } from '@uniswap/sdk-core';
import { Pair, Trade } from '@uniswap/v2-sdk';
import { getUniswapAmmQuote } from './quoteSwap';

async function simulateAmmSwap(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL'
): Promise<Static<typeof UniswapAmmSimulateSwapResponse>> {
  const uniswap = await Uniswap.getInstance(network);

  const { quote, baseTokenObj, quoteTokenObj } = await getUniswapAmmQuote(
    fastify,
    network,
    poolAddress,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side
  );

  const trade: Trade<Token, Token, TradeType> = quote.trade;

  const pair: Pair = trade.route.pairs[0];
  const reserve0 = pair.reserve0;
  const reserve1 = pair.reserve1;

  const inputAmount = trade.inputAmount;
  const outputAmount = trade.outputAmount;

  let newReserve0: CurrencyAmount<Token>, newReserve1: CurrencyAmount<Token>;

  if (trade.route.path[0].address === reserve0.currency.address) {
    newReserve0 = reserve0.add(inputAmount);
    newReserve1 = reserve1.subtract(outputAmount);
  } else {
    newReserve0 = reserve0.subtract(outputAmount);
    newReserve1 = reserve1.add(inputAmount);
  }
  
  const finalPrice = parseFloat(newReserve1.toExact()) / parseFloat(newReserve0.toExact());

  return {
    poolAddress,
    tokenIn: quote.inputToken.address,
    tokenOut: quote.outputToken.address,
    amountIn: quote.estimatedAmountIn,
    amountOut: quote.estimatedAmountOut,
    price: quote.estimatedAmountIn > 0 ? quote.estimatedAmountOut / quote.estimatedAmountIn : 0,
    priceImpactPct: quote.priceImpact,
    finalPrice,
  };
}

export const simulateSwapAmmRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof UniswapAmmSimulateSwapRequest>;
    Reply: Static<typeof UniswapAmmSimulateSwapResponse>;
  }>(
    '/simulate-swap',
    {
      schema: {
        description:
          'Simulate a swap on Uniswap V2 to get the estimated final price in the pool after the transaction.',
        tags: ['/connector/uniswap'],
        querystring: UniswapAmmSimulateSwapRequest,
        response: {
          200: UniswapAmmSimulateSwapResponse,
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
            const uniswap = await Uniswap.getInstance(network);
            poolAddressToUse = await uniswap.findDefaultPool(baseToken, quoteToken, 'amm');
            if (!poolAddressToUse) {
                throw fastify.httpErrors.notFound(`No AMM pool found for pair ${baseToken}-${quoteToken}`);
            }
        }

        return await simulateAmmSwap(
          fastify,
          network,
          poolAddressToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL'
        );
      } catch (e) {
        logger.error(`Simulate AMM swap failed: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to simulate AMM swap.');
      }
    }
  );
};
