# 📋 SEBI IPO Project — TODO

## 🔗 Blockchain Go-Live (Do Tomorrow)

> Everything is coded and ready. Just needs a 10-minute deployment step.

### Steps:
1. Open **remix.ethereum.org** in Chrome
2. Create new file → paste contents of `contracts/SEBIDocumentRegistry.sol`
3. Compile with Solidity `0.8.19`
4. Connect MetaMask (Polygon Amoy Testnet) → Deploy
5. Copy the contract address

6. Add these 3 lines to `backend/.env`:
   ```
   POLYGON_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/alch_wu3s8_SqzvnMTJc6LT1Fv
   BLOCKCHAIN_PRIVATE_KEY=0x<your MetaMask private key>
   BLOCKCHAIN_CONTRACT_ADDRESS=0x<address from Remix>
   ```

7. Restart backend → blockchain flips from MOCK → LIVE automatically ✅

### MetaMask Details:
- Wallet: `0xc1D3B...a5b27`
- Network: Polygon Amoy Testnet (Chain ID: 80002)
- Fix RPC in MetaMask settings → use: `https://polygon-amoy.g.alchemy.com/v2/alch_wu3s8_SqzvnMTJc6LT1Fv`

---

## ✅ Already Done
- [x] `contracts/SEBIDocumentRegistry.sol` — Solidity contract written
- [x] `backend/blockchain.py` — Python blockchain service
- [x] `backend/main.py` — Upload + generate flows integrated
- [x] `frontend/SplashScreen.jsx` — "Secured by Blockchain" animation
- [x] `web3` installed in venv
- [x] Mock mode working perfectly (no crash, no spend)
