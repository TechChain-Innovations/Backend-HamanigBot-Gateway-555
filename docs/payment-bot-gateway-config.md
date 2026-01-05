Payment Bot Gateway - Runtime Config (Dev2)
This note captures the working runtime config for Payment Bot Gateway on Dev2 and
why it must be applied in the PVC, not only in the image templates.
Important: PVC overrides image templates
In Dev2, conf/ is mounted from a PersistentVolumeClaim (PVC). That means:
Config files inside /home/gateway/conf/ persist across deploys.
New image templates in dist/src/templates/** do not overwrite existing
  files in the PVC.
If you change templates in git, you must also update the PVC (or delete/migrate
the PVC) for the runtime config to change.
Working config (same as local)
Apply these values inside the PVC:
/home/gateway/conf/chains/solana.yml
rpcProvider: url
/home/gateway/conf/rpc/helius.yml
useWebSocketRPC: false
useSender: false
/home/gateway/conf/chains/solana/mainnet-beta.yml
minPriorityFeePerCU: 0.01
Notes:
