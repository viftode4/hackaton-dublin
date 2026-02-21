# frozen_string_literal: true

# Stripe configuration
if ENV['STRIPE_SECRET_KEY'].present?
  Stripe.api_key = ENV['STRIPE_SECRET_KEY']
  Stripe.logger = Rails.logger if Rails.env.development?
end
