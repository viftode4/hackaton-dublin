use base64::Engine;
use solana_hash::Hash;
use solana_transaction::Transaction;

/// Minimal Solana JSON-RPC client using reqwest (no OpenSSL needed).
pub struct RpcClient {
    url: String,
    client: reqwest::Client,
}

#[derive(serde::Serialize)]
struct RpcRequest<'a> {
    jsonrpc: &'a str,
    id: u64,
    method: &'a str,
    params: serde_json::Value,
}

impl RpcClient {
    pub fn new(url: &str) -> Self {
        Self {
            url: url.to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub async fn get_latest_blockhash(&self) -> Result<Hash, String> {
        let body = RpcRequest {
            jsonrpc: "2.0",
            id: 1,
            method: "getLatestBlockhash",
            params: serde_json::json!([{"commitment": "confirmed"}]),
        };

        let resp: serde_json::Value = self
            .client
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("RPC request failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("RPC response parse failed: {}", e))?;

        let hash_str = resp["result"]["value"]["blockhash"]
            .as_str()
            .ok_or_else(|| format!("No blockhash in response: {}", resp))?;

        hash_str
            .parse::<Hash>()
            .map_err(|e| format!("Invalid blockhash: {}", e))
    }

    pub async fn send_and_confirm_transaction(
        &self,
        tx: &Transaction,
    ) -> Result<String, String> {
        let tx_bytes =
            bincode::serialize(tx).map_err(|e| format!("Failed to serialize tx: {}", e))?;
        let tx_base64 = base64::engine::general_purpose::STANDARD.encode(&tx_bytes);

        let body = RpcRequest {
            jsonrpc: "2.0",
            id: 1,
            method: "sendTransaction",
            params: serde_json::json!([
                tx_base64,
                {"encoding": "base64", "preflightCommitment": "confirmed"}
            ]),
        };

        let resp: serde_json::Value = self
            .client
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Send tx failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Send tx response parse failed: {}", e))?;

        if let Some(err) = resp.get("error") {
            return Err(format!("RPC error: {}", err));
        }

        let signature = resp["result"]
            .as_str()
            .ok_or_else(|| format!("No signature in response: {}", resp))?
            .to_string();

        self.confirm_transaction(&signature).await?;

        Ok(signature)
    }

    async fn confirm_transaction(&self, signature: &str) -> Result<(), String> {
        for _ in 0..30 {
            let body = RpcRequest {
                jsonrpc: "2.0",
                id: 1,
                method: "getSignatureStatuses",
                params: serde_json::json!([[signature]]),
            };

            let resp: serde_json::Value = self
                .client
                .post(&self.url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Confirm tx failed: {}", e))?
                .json()
                .await
                .map_err(|e| format!("Confirm tx parse failed: {}", e))?;

            if let Some(status) = resp["result"]["value"][0].as_object() {
                if status.get("confirmationStatus").is_some() {
                    if let Some(err) = status.get("err") {
                        if !err.is_null() {
                            return Err(format!("Transaction error: {}", err));
                        }
                    }
                    return Ok(());
                }
            }

            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        Err("Transaction confirmation timeout".into())
    }

    pub async fn get_balance(&self, pubkey: &solana_pubkey::Pubkey) -> Result<u64, String> {
        let body = RpcRequest {
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: serde_json::json!([pubkey.to_string(), {"commitment": "confirmed"}]),
        };

        let resp: serde_json::Value = self
            .client
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Get balance failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Get balance parse failed: {}", e))?;

        resp["result"]["value"]
            .as_u64()
            .ok_or_else(|| format!("No balance in response: {}", resp))
    }
}
