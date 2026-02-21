# frozen_string_literal: true

# Stripe configuration
Stripe.api_key = ENV['STRIPE_SECRET_KEY']

# Log Stripe API calls in Rails logger
Stripe.logger = Rails.logger if Rails.env.development?
