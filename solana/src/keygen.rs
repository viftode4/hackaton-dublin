use solana_keypair::Keypair;
use solana_signer::Signer;
use std::fs;
use std::path::Path;

fn main() {
    let wallet_path = Path::new("devnet-wallet.json");

    if wallet_path.exists() {
        let data = fs::read_to_string(wallet_path).expect("Failed to read wallet file");
        let bytes: Vec<u8> = serde_json::from_str(&data).expect("Invalid wallet JSON");
        let kp = Keypair::try_from(bytes.as_slice()).expect("Invalid keypair");
        println!("Wallet already exists:");
        println!("  Public key: {}", kp.pubkey());
        println!("  File: {}", wallet_path.display());
        println!("\nDelete devnet-wallet.json to generate a new one.");
        return;
    }

    let keypair = Keypair::new();
    let bytes: Vec<u8> = keypair.to_bytes().to_vec();
    let json = serde_json::to_string(&bytes).expect("Failed to serialize keypair");
    fs::write(wallet_path, json).expect("Failed to write wallet file");

    println!("New devnet wallet generated:");
    println!("  Public key: {}", keypair.pubkey());
    println!("  Saved to: {}", wallet_path.display());
    println!("\nNext: fund it at https://faucet.solana.com");
}
