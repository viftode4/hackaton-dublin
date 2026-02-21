mod mint;
mod rpc;
mod wallet;

use axum::{extract::State, http::StatusCode, routing::{get, post}, Json, Router};
use solana_keypair::Keypair;
use solana_signer::Signer;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

struct AppState {
    rpc_url: String,
    payer: Keypair,
}

#[derive(serde::Serialize)]
struct HealthResponse {
    status: String,
    wallet: String,
    rpc_url: String,
    balance_sol: Option<f64>,
}

#[derive(serde::Serialize)]
struct ErrorResponse {
    error: String,
}

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let rpc = rpc::RpcClient::new(&state.rpc_url);
    let balance = rpc
        .get_balance(&state.payer.pubkey())
        .await
        .ok()
        .map(|lamports| lamports as f64 / 1_000_000_000.0);

    Json(HealthResponse {
        status: "ok".into(),
        wallet: state.payer.pubkey().to_string(),
        rpc_url: state.rpc_url.clone(),
        balance_sol: balance,
    })
}

async fn mint_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<mint::MintRequest>,
) -> Result<Json<mint::MintResponse>, (StatusCode, Json<ErrorResponse>)> {
    let rpc = rpc::RpcClient::new(&state.rpc_url);

    match mint::mint(&rpc, &state.payer, &req).await {
        Ok(response) => Ok(Json(response)),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: e }),
        )),
    }
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let rpc_url =
        std::env::var("SOLANA_RPC_URL").unwrap_or_else(|_| "https://api.devnet.solana.com".into());
    let wallet_path = std::env::var("WALLET_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("devnet-wallet.json"));

    let payer = wallet::load_wallet(&wallet_path).expect("Failed to load wallet");
    tracing::info!("Wallet loaded: {}", payer.pubkey());

    let state = Arc::new(AppState {
        rpc_url: rpc_url.clone(),
        payer,
    });

    let app = Router::new()
        .route("/health", get(health))
        .route("/mint", post(mint_handler))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3001".into());
    let addr = format!("0.0.0.0:{}", port);
    tracing::info!("Solana service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
