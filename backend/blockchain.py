"""
blockchain.py — SEBI SME IPO Document Anchoring Service
========================================================
Provides SHA-256 hashing and Polygon (Amoy Testnet) blockchain anchoring
for uploaded compliance documents, generated draft prospectuses, and
compliance audit log snapshots.

Architecture
------------
  Off-chain : Documents stay in local storage (or are deleted after extraction)
  On-chain  : Only SHA-256 hashes are sent to the SEBIDocumentRegistry contract

Modes
-----
  LIVE mode : web3 installed + POLYGON_RPC_URL + BLOCKCHAIN_PRIVATE_KEY set in .env
  MOCK mode : Any of the above missing → graceful fallback, no crash, logs prefix [MOCK]

Environment Variables (.env)
-----------------------------
  POLYGON_RPC_URL            = https://rpc-amoy.polygon.technology  (or Alchemy/Infura)
  BLOCKCHAIN_PRIVATE_KEY     = 0x<your_test_wallet_private_key>
  BLOCKCHAIN_CONTRACT_ADDRESS= 0x<deployed_SEBIDocumentRegistry_address>
  BLOCKCHAIN_SESSION_ID      = sebi-ipo-session-v1   (optional, default used if missing)
"""

import os
import json
import hashlib
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("sebi-ipo-generator.blockchain")

# ── ABI for SEBIDocumentRegistry (only the functions we call) ────────────────
CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "bytes32", "name": "_docHash",   "type": "bytes32"},
            {"internalType": "string",  "name": "_docType",   "type": "string"},
            {"internalType": "string",  "name": "_sessionId", "type": "string"},
        ],
        "name": "anchorDocument",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "bytes32", "name": "_draftHash",   "type": "bytes32"},
            {"internalType": "string",  "name": "_sessionId",   "type": "string"},
            {"internalType": "string",  "name": "_companyName", "type": "string"},
        ],
        "name": "sealProspectus",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "string",  "name": "_sessionId",    "type": "string"},
            {"internalType": "bytes32", "name": "_snapshotHash", "type": "bytes32"},
            {"internalType": "uint8",   "name": "_checksRun",    "type": "uint8"},
            {"internalType": "uint8",   "name": "_checksPassed", "type": "uint8"},
        ],
        "name": "logAudit",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "_docHash", "type": "bytes32"}],
        "name": "verifyDocument",
        "outputs": [
            {"internalType": "bool",    "name": "exists",     "type": "bool"},
            {"internalType": "uint256", "name": "anchoredAt", "type": "uint256"},
            {"internalType": "string",  "name": "docType",    "type": "string"},
            {"internalType": "string",  "name": "sessionId",  "type": "string"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [{"internalType": "bytes32", "name": "_draftHash", "type": "bytes32"}],
        "name": "verifyProspectus",
        "outputs": [
            {"internalType": "bool",    "name": "exists",      "type": "bool"},
            {"internalType": "uint256", "name": "sealedAt",    "type": "uint256"},
            {"internalType": "string",  "name": "companyName", "type": "string"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "totalDocuments",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

# ── web3 import with graceful fallback ───────────────────────────────────────
try:
    from web3 import Web3
    from web3.exceptions import ContractLogicError
    WEB3_AVAILABLE = True
except ImportError:
    WEB3_AVAILABLE = False
    logger.warning(
        "web3 package not installed. Blockchain anchoring running in MOCK mode. "
        "Install with: pip install web3"
    )


# ── Configuration ─────────────────────────────────────────────────────────────

def _get_config() -> Dict[str, str]:
    """Read blockchain config from environment variables."""
    return {
        "rpc_url":          os.getenv("POLYGON_RPC_URL", ""),
        "private_key":      os.getenv("BLOCKCHAIN_PRIVATE_KEY", ""),
        "contract_address": os.getenv("BLOCKCHAIN_CONTRACT_ADDRESS", ""),
        "session_id":       os.getenv("BLOCKCHAIN_SESSION_ID", "sebi-ipo-session-v1"),
        "network_name":     os.getenv("BLOCKCHAIN_NETWORK", "Polygon Amoy Testnet"),
        "explorer_base":    os.getenv("BLOCKCHAIN_EXPLORER", "https://amoy.polygonscan.com/tx/"),
    }


def _is_mock() -> bool:
    """Returns True if any critical config is missing → mock mode."""
    if not WEB3_AVAILABLE:
        return True
    cfg = _get_config()
    missing = [k for k in ("rpc_url", "private_key", "contract_address") if not cfg[k]]
    if missing:
        logger.debug(f"Blockchain MOCK mode active. Missing env vars: {missing}")
        return True
    return False


# ── Hashing utilities ─────────────────────────────────────────────────────────

def compute_sha256_file(file_path: str) -> str:
    """
    Compute SHA-256 of a file on disk.
    Returns hex string like '0xabc123...' (66 chars total).
    """
    sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(65536), b""):
                sha256.update(chunk)
        return "0x" + sha256.hexdigest()
    except Exception as e:
        logger.error(f"SHA-256 hashing failed for {file_path}: {e}")
        raise


def compute_sha256_bytes(data: bytes) -> str:
    """
    Compute SHA-256 of in-memory bytes (e.g. a generated .docx read into memory).
    Returns hex string like '0xabc123...'.
    """
    return "0x" + hashlib.sha256(data).hexdigest()


def compute_sha256_dict(data: Dict) -> str:
    """
    Compute SHA-256 of a Python dict serialised as canonical JSON.
    Used to snapshot session_state.json for the audit log.
    """
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return "0x" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _hex_to_bytes32(hex_hash: str) -> bytes:
    """Convert '0x<64-char hex>' → 32-byte value for the Solidity bytes32 param."""
    clean = hex_hash.removeprefix("0x")
    if len(clean) != 64:
        raise ValueError(f"Expected 64-char hex, got {len(clean)}: {hex_hash!r}")
    return bytes.fromhex(clean)


# ── Internal: build web3 connection ──────────────────────────────────────────

def _get_web3_and_contract():
    """
    Returns (w3, contract, account) tuple if LIVE mode, raises RuntimeError in MOCK.
    """
    cfg = _get_config()
    w3 = Web3(Web3.HTTPProvider(cfg["rpc_url"]))
    if not w3.is_connected():
        raise RuntimeError(f"Cannot connect to RPC: {cfg['rpc_url']}")

    account = w3.eth.account.from_key(cfg["private_key"])
    contract = w3.eth.contract(
        address=Web3.to_checksum_address(cfg["contract_address"]),
        abi=CONTRACT_ABI,
    )
    return w3, contract, account


# ── Public API ────────────────────────────────────────────────────────────────

def anchor_document_hash(
    doc_hash: str,
    doc_type: str,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Anchor a document SHA-256 hash on the Polygon blockchain.

    Args:
        doc_hash   : '0x' + 64-char hex SHA-256 of the document file
        doc_type   : 'financials' | 'gst' | 'incorporation' | 'compliance'
        session_id : optional override for session identifier

    Returns dict with keys:
        status       : 'success' | 'mock' | 'error'
        tx_hash      : Polygon transaction hash (or mock placeholder)
        explorer_url : PolygonScan URL for the transaction
        doc_hash     : echo of input hash
        mode         : 'live' | 'mock'
    """
    cfg = _get_config()
    sid = session_id or cfg["session_id"]

    if _is_mock():
        mock_tx = "0x" + ("ab" * 32)
        logger.info(f"[MOCK] Document anchored: type={doc_type} hash={doc_hash[:18]}...")
        return {
            "status": "mock",
            "tx_hash": mock_tx,
            "block_number": None,
            "explorer_url": f"{cfg['explorer_base']}{mock_tx}",
            "doc_hash": doc_hash,
            "doc_type": doc_type,
            "mode": "mock",
            "network": cfg["network_name"],
        }

    try:
        w3, contract, account = _get_web3_and_contract()
        hash_bytes = _hex_to_bytes32(doc_hash)

        tx = contract.functions.anchorDocument(
            hash_bytes, doc_type, sid
        ).build_transaction({
            "from":     account.address,
            "nonce":    w3.eth.get_transaction_count(account.address),
            "gas":      120_000,
            "gasPrice": w3.eth.gas_price,
        })

        signed  = w3.eth.account.sign_transaction(tx, cfg["private_key"])
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=90)

        tx_hex = w3.to_hex(tx_hash)
        logger.info(
            f"[LIVE] Document anchored on {cfg['network_name']} | "
            f"type={doc_type} | block={receipt.blockNumber} | tx={tx_hex[:18]}..."
        )
        return {
            "status": "success",
            "tx_hash": tx_hex,
            "block_number": receipt.blockNumber,
            "explorer_url": f"{cfg['explorer_base']}{tx_hex}",
            "doc_hash": doc_hash,
            "doc_type": doc_type,
            "mode": "live",
            "network": cfg["network_name"],
        }

    except Exception as e:
        logger.error(f"Blockchain anchoring FAILED for {doc_type}: {e}")
        return {
            "status": "error",
            "error": str(e),
            "doc_hash": doc_hash,
            "doc_type": doc_type,
            "mode": "live",
        }


def seal_prospectus(
    draft_hash: str,
    company_name: str,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Seal a generated Draft Prospectus (.docx) hash on the blockchain.

    Args:
        draft_hash   : '0x' + 64-char hex SHA-256 of the .docx bytes
        company_name : Company name (for on-chain event readability)
        session_id   : optional override

    Returns same shape as anchor_document_hash().
    """
    cfg = _get_config()
    sid = session_id or cfg["session_id"]

    if _is_mock():
        mock_tx = "0x" + ("cd" * 32)
        logger.info(f"[MOCK] Prospectus sealed: company={company_name} hash={draft_hash[:18]}...")
        return {
            "status": "mock",
            "tx_hash": mock_tx,
            "block_number": None,
            "explorer_url": f"{cfg['explorer_base']}{mock_tx}",
            "draft_hash": draft_hash,
            "company_name": company_name,
            "mode": "mock",
            "network": cfg["network_name"],
        }

    try:
        w3, contract, account = _get_web3_and_contract()
        hash_bytes = _hex_to_bytes32(draft_hash)

        tx = contract.functions.sealProspectus(
            hash_bytes, sid, company_name
        ).build_transaction({
            "from":     account.address,
            "nonce":    w3.eth.get_transaction_count(account.address),
            "gas":      120_000,
            "gasPrice": w3.eth.gas_price,
        })

        signed  = w3.eth.account.sign_transaction(tx, cfg["private_key"])
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=90)

        tx_hex = w3.to_hex(tx_hash)
        logger.info(
            f"[LIVE] Prospectus sealed on {cfg['network_name']} | "
            f"company={company_name} | block={receipt.blockNumber} | tx={tx_hex[:18]}..."
        )
        return {
            "status": "success",
            "tx_hash": tx_hex,
            "block_number": receipt.blockNumber,
            "explorer_url": f"{cfg['explorer_base']}{tx_hex}",
            "draft_hash": draft_hash,
            "company_name": company_name,
            "mode": "live",
            "network": cfg["network_name"],
        }

    except Exception as e:
        logger.error(f"Prospectus sealing FAILED for {company_name}: {e}")
        return {
            "status": "error",
            "error": str(e),
            "draft_hash": draft_hash,
            "company_name": company_name,
            "mode": "live",
        }


def log_audit_snapshot(
    session_snapshot: Dict,
    checks_run: int,
    checks_passed: int,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Log an immutable compliance audit snapshot to the blockchain.

    Args:
        session_snapshot : dict of current session data (will be hashed, not stored on-chain)
        checks_run       : total number of ICDR checks executed
        checks_passed    : number of checks that passed without flags
        session_id       : optional override

    Returns same shape as anchor_document_hash().
    """
    cfg   = _get_config()
    sid   = session_id or cfg["session_id"]
    snap_hash = compute_sha256_dict(session_snapshot)

    if _is_mock():
        mock_tx = "0x" + ("ef" * 32)
        logger.info(
            f"[MOCK] Audit logged: checks={checks_run} passed={checks_passed} "
            f"snapshot={snap_hash[:18]}..."
        )
        return {
            "status": "mock",
            "tx_hash": mock_tx,
            "snapshot_hash": snap_hash,
            "checks_run": checks_run,
            "checks_passed": checks_passed,
            "mode": "mock",
            "network": cfg["network_name"],
        }

    try:
        w3, contract, account = _get_web3_and_contract()
        hash_bytes = _hex_to_bytes32(snap_hash)

        tx = contract.functions.logAudit(
            sid, hash_bytes, checks_run, checks_passed
        ).build_transaction({
            "from":     account.address,
            "nonce":    w3.eth.get_transaction_count(account.address),
            "gas":      100_000,
            "gasPrice": w3.eth.gas_price,
        })

        signed  = w3.eth.account.sign_transaction(tx, cfg["private_key"])
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=90)

        tx_hex = w3.to_hex(tx_hash)
        logger.info(
            f"[LIVE] Audit logged on {cfg['network_name']} | "
            f"checks={checks_run}/{checks_passed} | block={receipt.blockNumber}"
        )
        return {
            "status": "success",
            "tx_hash": tx_hex,
            "snapshot_hash": snap_hash,
            "checks_run": checks_run,
            "checks_passed": checks_passed,
            "mode": "live",
            "network": cfg["network_name"],
        }

    except Exception as e:
        logger.error(f"Audit log FAILED: {e}")
        return {
            "status": "error",
            "error": str(e),
            "snapshot_hash": snap_hash,
            "mode": "live",
        }


def verify_document_hash(doc_hash: str) -> Dict[str, Any]:
    """
    Query the blockchain to verify whether a document hash was previously anchored.

    Returns dict with:
        exists       : bool
        anchored_at  : ISO timestamp string or None
        doc_type     : str
        session_id   : str
        mode         : 'live' | 'mock'
    """
    if _is_mock():
        return {
            "exists": False,
            "anchored_at": None,
            "doc_type": None,
            "session_id": None,
            "mode": "mock",
            "note": "Blockchain in mock mode — configure .env to enable live verification",
        }

    try:
        import datetime
        w3, contract, _ = _get_web3_and_contract()
        hash_bytes = _hex_to_bytes32(doc_hash)
        exists, anchored_at_ts, doc_type, session_id = contract.functions.verifyDocument(hash_bytes).call()

        anchored_iso = (
            datetime.datetime.utcfromtimestamp(anchored_at_ts).isoformat() + "Z"
            if anchored_at_ts > 0 else None
        )
        return {
            "exists": exists,
            "anchored_at": anchored_iso,
            "doc_type": doc_type,
            "session_id": session_id,
            "mode": "live",
        }
    except Exception as e:
        logger.error(f"Verification query failed: {e}")
        return {"exists": False, "error": str(e), "mode": "live"}


def verify_prospectus_hash(draft_hash: str) -> Dict[str, Any]:
    """
    Query the blockchain to verify whether a prospectus hash was previously sealed.
    """
    if _is_mock():
        return {
            "exists": False,
            "sealed_at": None,
            "company_name": None,
            "mode": "mock",
            "note": "Blockchain in mock mode — configure .env to enable live verification",
        }

    try:
        import datetime
        w3, contract, _ = _get_web3_and_contract()
        hash_bytes = _hex_to_bytes32(draft_hash)
        exists, sealed_at_ts, company_name = contract.functions.verifyProspectus(hash_bytes).call()

        sealed_iso = (
            datetime.datetime.utcfromtimestamp(sealed_at_ts).isoformat() + "Z"
            if sealed_at_ts > 0 else None
        )
        return {
            "exists": exists,
            "sealed_at": sealed_iso,
            "company_name": company_name,
            "mode": "live",
        }
    except Exception as e:
        logger.error(f"Prospectus verification query failed: {e}")
        return {"exists": False, "error": str(e), "mode": "live"}


def get_blockchain_status() -> Dict[str, Any]:
    """
    Returns connectivity status, wallet address, and MATIC balance.
    Safe to call on startup for a health-check endpoint.
    """
    cfg = _get_config()

    if not WEB3_AVAILABLE:
        return {
            "mode": "mock",
            "reason": "web3 package not installed (pip install web3)",
            "network": cfg["network_name"],
            "connected": False,
            "contract_configured": False,
        }

    missing = [k for k in ("rpc_url", "private_key", "contract_address") if not cfg[k]]
    if missing:
        return {
            "mode": "mock",
            "reason": f"Missing .env vars: {missing}",
            "network": cfg["network_name"],
            "connected": False,
            "contract_configured": False,
        }

    try:
        w3 = Web3(Web3.HTTPProvider(cfg["rpc_url"]))
        if not w3.is_connected():
            return {
                "mode": "live_error",
                "reason": f"Cannot reach RPC: {cfg['rpc_url']}",
                "connected": False,
                "contract_configured": True,
            }

        account = w3.eth.account.from_key(cfg["private_key"])
        balance_wei = w3.eth.get_balance(account.address)
        balance_matic = float(Web3.from_wei(balance_wei, "ether"))

        contract = w3.eth.contract(
            address=Web3.to_checksum_address(cfg["contract_address"]),
            abi=CONTRACT_ABI,
        )
        total_docs = contract.functions.totalDocuments().call()

        return {
            "mode": "live",
            "network": cfg["network_name"],
            "connected": True,
            "contract_configured": True,
            "contract_address": cfg["contract_address"],
            "wallet_address": account.address,
            "wallet_balance_matic": round(balance_matic, 6),
            "total_anchored_documents": total_docs,
            "explorer_base": cfg["explorer_base"],
        }

    except Exception as e:
        return {
            "mode": "live_error",
            "reason": str(e),
            "connected": False,
            "contract_configured": bool(cfg["contract_address"]),
        }
