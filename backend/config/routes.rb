Rails.application.routes.draw do
  # API namespace for versioning
  namespace :api do
    # Locations (read-only, static data)
    resources :locations, only: [:index, :show]

    # Inventory (user's data centers)
    resources :inventories, only: [:index, :show, :create, :update, :destroy]

    # Reports (Claude-generated)
    post 'reports/scorecard', to: 'reports#scorecard'
    post 'reports/blueprint', to: 'reports#blueprint'

    # Advisor (Chat and recommendations)
    post 'advisor/chat', to: 'advisor#chat'
    post 'advisor/recommend', to: 'advisor#recommend'

    # Payments (Stripe)
    post 'payments/checkout', to: 'payments#checkout'
    get 'payments/session/:session_id', to: 'payments#session_status'
    get 'payments/check', to: 'payments#check_blueprint_payment'

    # Webhooks (Stripe)
    post 'webhooks/stripe', to: 'webhooks#stripe'

    # Portfolio analytics
    get 'portfolio/stats', to: 'portfolio#stats'

    # CO2 Prediction (ML model)
    post 'predict/co2', to: 'predictions#co2'
    get  'predict/info', to: 'predictions#info'

    # Blockchain
    post 'solana/mint', to: 'solana#mint'

    # TLE satellite data (proxied from CelesTrak)
    get 'tle', to: 'tle#index'

    # Planetary region data (moon/mars features, geology)
    get 'planetary/:body/:dataset', to: 'planetary_data#show'
  end

  # Stripe redirect pages (temporary — frontend will handle these)
  get 'success', to: proc { |_env|
    session_id = Rack::Utils.parse_query(_env['QUERY_STRING'])['session_id']
    [200, { 'Content-Type' => 'text/html' }, ["<html><body style='font-family:sans-serif;text-align:center;padding:60px'><h1>Payment Successful!</h1><p>Session: #{session_id}</p><p>Your blueprint is now unlocked.</p></body></html>"]]
  }
  get 'cancel', to: proc { [200, { 'Content-Type' => 'text/html' }, ['<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h1>Payment Cancelled</h1><p>No charge was made.</p></body></html>']] }

  # Health check (for deployment monitoring)
  get 'health', to: proc { [200, {}, ['OK']] }

  # Root
  root to: proc { [200, { 'Content-Type' => 'application/json' }, [{ status: 'Orbital Atlas API running' }.to_json]] }
end
