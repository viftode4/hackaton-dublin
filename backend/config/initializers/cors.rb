# frozen_string_literal: true

# Configure CORS to accept requests from frontend
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'  # Note: Restrict in production
    resource '*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
