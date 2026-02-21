use solana_keypair::Keypair;
use std::fs;
use std::path::Path;

/// Load a Solana keypair from a JSON file (array of secret key bytes).
pub fn load_wallet(path: &Path) -> Result<Keypair, String> {
    let data = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read wallet file {}: {}", path.display(), e))?;

    let bytes: Vec<u8> = serde_json::from_str(&data)
        .map_err(|e| format!("Invalid wallet JSON: {}", e))?;

    Keypair::try_from(bytes.as_slice())
        .map_err(|e| format!("Invalid keypair bytes: {}", e))
}
