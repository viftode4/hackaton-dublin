use crate::rpc::RpcClient;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;
use std::str::FromStr;

const MEMO_PROGRAM_ID: &str = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const MEMO_MAX_BYTES: usize = 566;

#[derive(Debug, Deserialize, Serialize)]
pub struct MintRequest {
    pub location_id: String,
    pub name: Option<String>,
    pub capacity_mw: Option<f64>,
    pub grade: Option<String>,
    pub report_hash: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MemoRecord {
    #[serde(rename = "type")]
    pub record_type: String,
    pub version: u8,
    pub location_id: String,
    pub name: Option<String>,
    pub capacity_mw: Option<f64>,
    pub feasibility_grade: Option<String>,
    pub timestamp: String,
    pub report_hash: String,
}

#[derive(Debug, Serialize)]
pub struct MintResponse {
    pub signature: String,
    pub memo_content: MemoRecord,
    pub explorer_url: String,
}

fn hash_request(req: &MintRequest) -> String {
    let json = serde_json::to_string(req).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(json.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..8])
}

pub fn build_memo(req: &MintRequest) -> MemoRecord {
    MemoRecord {
        record_type: "orbital-atlas-dc-record".into(),
        version: 1,
        location_id: req.location_id.clone(),
        name: req.name.clone(),
        capacity_mw: req.capacity_mw,
        feasibility_grade: req.grade.clone(),
        timestamp: Utc::now().to_rfc3339(),
        report_hash: req.report_hash.clone().unwrap_or_else(|| hash_request(req)),
    }
}

pub async fn mint(
    rpc: &RpcClient,
    payer: &Keypair,
    req: &MintRequest,
) -> Result<MintResponse, String> {
    let memo_record = build_memo(req);
    let memo_json = serde_json::to_string(&memo_record)
        .map_err(|e| format!("Failed to serialize memo: {}", e))?;

    if memo_json.len() > MEMO_MAX_BYTES {
        return Err(format!(
            "Memo too large ({} bytes, max {})",
            memo_json.len(),
            MEMO_MAX_BYTES
        ));
    }

    let memo_program_id =
        Pubkey::from_str(MEMO_PROGRAM_ID).map_err(|e| format!("Invalid memo program ID: {}", e))?;

    let instruction = Instruction {
        program_id: memo_program_id,
        accounts: vec![AccountMeta::new_readonly(payer.pubkey(), true)],
        data: memo_json.as_bytes().to_vec(),
    };

    let recent_blockhash = rpc.get_latest_blockhash().await?;

    let mut tx = Transaction::new_with_payer(&[instruction], Some(&payer.pubkey()));
    tx.sign(&[payer], recent_blockhash);

    let signature = rpc.send_and_confirm_transaction(&tx).await?;

    Ok(MintResponse {
        signature: signature.clone(),
        memo_content: memo_record,
        explorer_url: format!(
            "https://explorer.solana.com/tx/{}?cluster=devnet",
            signature
        ),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_memo_structure() {
        let req = MintRequest {
            location_id: "iceland-reykjavik".into(),
            name: Some("Test DC".into()),
            capacity_mw: Some(50.0),
            grade: Some("A".into()),
            report_hash: None,
        };
        let memo = build_memo(&req);
        assert_eq!(memo.record_type, "orbital-atlas-dc-record");
        assert_eq!(memo.version, 1);
        assert_eq!(memo.location_id, "iceland-reykjavik");
        assert_eq!(memo.report_hash.len(), 16);
    }

    #[test]
    fn test_memo_size_within_limit() {
        let req = MintRequest {
            location_id: "iceland-reykjavik".into(),
            name: Some("AcmeCorp Green-1".into()),
            capacity_mw: Some(50.0),
            grade: Some("A".into()),
            report_hash: Some("abcdef1234567890".into()),
        };
        let memo = build_memo(&req);
        let json = serde_json::to_string(&memo).unwrap();
        assert!(
            json.len() <= MEMO_MAX_BYTES,
            "Memo {} bytes exceeds {} limit",
            json.len(),
            MEMO_MAX_BYTES
        );
    }

    #[test]
    fn test_hash_deterministic() {
        let req = MintRequest {
            location_id: "test".into(),
            name: None,
            capacity_mw: None,
            grade: None,
            report_hash: None,
        };
        let h1 = hash_request(&req);
        let h2 = hash_request(&req);
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 16);
    }
}
