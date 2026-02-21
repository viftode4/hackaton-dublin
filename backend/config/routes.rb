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

    # Portfolio analytics
    get 'portfolio/stats', to: 'portfolio#stats'

    # Blockchain
    post 'solana/mint', to: 'solana#mint'
  end

  # Health check (for deployment monitoring)
  get 'health', to: proc { [200, {}, ['OK']] }

  # Root
  root to: proc { [200, { 'Content-Type' => 'application/json' }, [{ status: 'Orbital Atlas API running' }.to_json]] }
end
