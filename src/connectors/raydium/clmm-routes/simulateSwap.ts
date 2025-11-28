import { Static } from '@sinclair/typebox';
import { FastifyPluginAsync, FastifyInstance } from 'fastify';
import Decimal from 'decimal.js';
import BN from 'bn.js';

import { logger } from '../../../services/logger';
import { Raydium } from '../raydium';
import { RaydiumClmmSimulateSwapRequest, RaydiumClmmSimulateSwapResponse } from '../schemas';
import { getSwapQuote } from './quoteSwap';

async function simulateClmmSwap(
  fastify: FastifyInstance,
  network: string,
  poolAddress: string,
  baseTokenSymbol: string,
  quoteTokenSymbol: string,
  amount: number,
  side: 'BUY' | 'SELL'
): Promise<Static<typeof RaydiumClmmSimulateSwapResponse>> {
  const { inputToken, outputToken, response } = await getSwapQuote(
    fastify,
    network,
    baseTokenSymbol,
    quoteTokenSymbol,
    amount,
    side,
    poolAddress
  );

  const normalizeBnAmount = (value: BN | Decimal, decimals: number): number => {
    const asDecimal = value instanceof Decimal ? value : new Decimal(value.toString());
    return asDecimal.div(new Decimal(10).pow(decimals)).toNumber();
  };

  const amountIn =
    'realAmountIn' in response
      ? parseFloat(response.realAmountIn.amount.toExact())
      : normalizeBnAmount((response as any).amountIn.amount, inputToken.decimals);

  const amountOut =
    'amountOut' in response
      ? parseFloat(response.amountOut.amount.toExact())
      : normalizeBnAmount((response as any).realAmountOut.amount, outputToken.decimals);

  const price = amountIn > 0 ? amountOut / amountIn : 0;
  const priceImpactPct = response.priceImpact ? parseFloat(response.priceImpact.toSignificant(6)) * 100 : 0;

  // executionPrice represents the pool price after the simulated swap
  const finalPrice =
    'executionPrice' in response && typeof (response as any).executionPrice?.toSignificant === 'function'
      ? parseFloat((response as any).executionPrice.toSignificant(15))
      : (response as any).executionPrice
      ? new Decimal((response as any).executionPrice.toString()).toNumber()
      : 0;

  return {
    poolAddress,
    tokenIn: inputToken.address,
    tokenOut: outputToken.address,
    amountIn,
    amountOut,
    price,
    priceImpactPct,
    finalPrice,
  };
}

export const simulateSwapClmmRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: Static<typeof RaydiumClmmSimulateSwapRequest>;
    Reply: Static<typeof RaydiumClmmSimulateSwapResponse>;
  }>(
    '/simulate-swap',
    {
      schema: {
        description: 'Simulate a swap on Raydium CLMM to get the estimated final price.',
        tags: ['/connector/raydium'],
        querystring: RaydiumClmmSimulateSwapRequest,
        response: {
          200: RaydiumClmmSimulateSwapResponse,
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
            poolAddressToUse = await raydium.findDefaultPool(baseToken, quoteToken, 'clmm');
            if (!poolAddressToUse) {
                throw fastify.httpErrors.notFound(`No CLMM pool found for pair ${baseToken}-${quoteToken}`);
            }
        }

        return await simulateClmmSwap(
          fastify,
          network,
          poolAddressToUse,
          baseToken,
          quoteToken,
          amount,
          side as 'BUY' | 'SELL'
        );
      } catch (e) {
        logger.error(`Simulate CLMM swap failed: ${e.message}`);
        if (e.statusCode) throw e;
        throw fastify.httpErrors.internalServerError('Failed to simulate CLMM swap.');
      }
    }
  );
};
