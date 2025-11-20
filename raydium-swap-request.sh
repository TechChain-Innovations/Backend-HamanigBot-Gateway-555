#!/bin/bash

curl -X POST http://localhost:15888/connectors/raydium/amm/execute-swap \
  -H "Content-Type: application/json" \
  -d '{
    "network": "mainnet-beta",
    "walletAddress": "HkkvaVWoVpSBeSpaRvKdoLvXDhox8LWrAhr2LKPVBWLZ",
    "baseToken": "So11111111111111111111111111111111111111112",
    "quoteToken": "BCos8JF8paBbnovnB3jZ7Ea79ZWaEsX1fhxvgNSU5ep6",
    "amount": 0.0005,
    "side": "BUY",
    "slippagePct": 5,
    "poolAddress": "EtGJNigeWeS5qimtWEqch2RhrQbRR5o5BoPX4txodvvC"
  }'
