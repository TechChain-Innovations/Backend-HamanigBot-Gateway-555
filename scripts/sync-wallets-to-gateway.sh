#!/bin/bash

# Script to sync wallets from wallet-service to Hummingbot Gateway
# Usage: ./sync-wallets-to-gateway.sh <AUTH_TOKEN> [BOT_ID]

set -e

# Configuration
WALLET_SERVICE_URL="https://wallet-service-dev2.techchain.solutions"
GATEWAY_POD="hummingbot-gateway-86c5dcc554-jl5w5"
NAMESPACE="tmb-dev"
BOT_ID="${2:-101}"  # Default to bot 101

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if token is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Authorization token required${NC}"
    echo "Usage: $0 <AUTH_TOKEN> [BOT_ID]"
    echo ""
    echo "Get token from: /auth skill or login to the platform"
    exit 1
fi

AUTH_TOKEN="$1"

echo "=============================================="
echo "  Wallet Sync: wallet-service -> Gateway"
echo "=============================================="
echo ""
echo "Bot ID: $BOT_ID"
echo "Gateway Pod: $GATEWAY_POD"
echo "Namespace: $NAMESPACE"
echo ""

# Step 1: Get all wallets for the bot
echo -e "${YELLOW}Step 1: Fetching wallets for bot $BOT_ID...${NC}"

WALLETS_RESPONSE=$(curl -s -X 'GET' \
  "${WALLET_SERVICE_URL}/wallets/balances?botId=${BOT_ID}" \
  -H 'accept: application/json' \
  -H "Authorization: Bearer ${AUTH_TOKEN}")

# Check if response is valid
if echo "$WALLETS_RESPONSE" | jq -e '.data' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Successfully fetched wallet data${NC}"
else
    echo -e "${RED}✗ Failed to fetch wallets. Response:${NC}"
    echo "$WALLETS_RESPONSE"
    exit 1
fi

# Extract all unique wallet addresses
ADDRESSES=$(echo "$WALLETS_RESPONSE" | jq -r '.data[].wallets[].walletAddress' | sort -u)
TOTAL_WALLETS=$(echo "$ADDRESSES" | wc -l | tr -d ' ')

echo "Found $TOTAL_WALLETS unique wallet addresses"
echo ""

# Step 2: Process each wallet
echo -e "${YELLOW}Step 2: Processing wallets...${NC}"
echo ""

COUNTER=0
SUCCESS=0
FAILED=0

for ADDRESS in $ADDRESSES; do
    COUNTER=$((COUNTER + 1))
    echo "[$COUNTER/$TOTAL_WALLETS] Processing: $ADDRESS"

    # Get private key for this address
    echo "  - Fetching private key..."
    PK_RESPONSE=$(curl -s -X 'GET' \
      "${WALLET_SERVICE_URL}/wallets/${ADDRESS}/private-key" \
      -H 'accept: application/json' \
      -H "Authorization: Bearer ${AUTH_TOKEN}")

    PRIVATE_KEY=$(echo "$PK_RESPONSE" | jq -r '.privateKey // empty')
    CHAIN_TYPE=$(echo "$PK_RESPONSE" | jq -r '.chainType // "solana"')

    if [ -z "$PRIVATE_KEY" ]; then
        echo -e "  ${RED}✗ Failed to get private key${NC}"
        echo "    Response: $PK_RESPONSE"
        FAILED=$((FAILED + 1))
        continue
    fi

    echo "  - Private key obtained (${#PRIVATE_KEY} chars)"

    # Add wallet to Gateway via kubectl exec
    echo "  - Adding to Gateway..."

    GATEWAY_RESPONSE=$(ssh -i ~/.ssh/trading-mm alex@10.0.1.6 "kubectl exec ${GATEWAY_POD} -n ${NAMESPACE} -- curl -s -X 'POST' \
      'http://localhost:15888/wallet/add' \
      -H 'accept: application/json' \
      -H 'Content-Type: application/json' \
      -d '{
        \"chain\": \"${CHAIN_TYPE}\",
        \"privateKey\": \"${PRIVATE_KEY}\",
        \"setDefault\": false
      }'" 2>/dev/null)

    # Check result
    if echo "$GATEWAY_RESPONSE" | jq -e '.address' > /dev/null 2>&1; then
        RETURNED_ADDRESS=$(echo "$GATEWAY_RESPONSE" | jq -r '.address')
        echo -e "  ${GREEN}✓ Successfully added: $RETURNED_ADDRESS${NC}"
        SUCCESS=$((SUCCESS + 1))
    elif echo "$GATEWAY_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
        MESSAGE=$(echo "$GATEWAY_RESPONSE" | jq -r '.message')
        if [[ "$MESSAGE" == *"already exists"* ]]; then
            echo -e "  ${YELLOW}⚠ Wallet already exists${NC}"
            SUCCESS=$((SUCCESS + 1))
        else
            echo -e "  ${RED}✗ Error: $MESSAGE${NC}"
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "  ${RED}✗ Unknown error${NC}"
        echo "    Response: $GATEWAY_RESPONSE"
        FAILED=$((FAILED + 1))
    fi

    echo ""
done

# Summary
echo "=============================================="
echo "  Summary"
echo "=============================================="
echo -e "Total wallets: $TOTAL_WALLETS"
echo -e "${GREEN}Successful: $SUCCESS${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

# Verify wallets in Gateway
echo -e "${YELLOW}Verifying wallets in Gateway...${NC}"
GATEWAY_WALLETS=$(ssh -i ~/.ssh/trading-mm alex@10.0.1.6 "kubectl exec ${GATEWAY_POD} -n ${NAMESPACE} -- curl -s -X 'GET' 'http://localhost:15888/wallet' -H 'accept: application/json'" 2>/dev/null)

echo "$GATEWAY_WALLETS" | jq '.wallets // .'

echo ""
echo -e "${GREEN}Done!${NC}"
