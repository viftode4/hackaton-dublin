# frozen_string_literal: true

module Api
  class WebhooksController < ApplicationController
    # Skip the global error handler — webhooks must return 200 quickly
    skip_before_action :log_request

    # POST /api/webhooks/stripe
    def stripe
      payload = request.body.read
      sig_header = request.env['HTTP_STRIPE_SIGNATURE']

      event = verify_event(payload, sig_header)
      return head :bad_request unless event

      case event['type']
      when 'checkout.session.completed'
        handle_checkout_completed(event['data']['object'])
      when 'checkout.session.async_payment_succeeded'
        handle_checkout_completed(event['data']['object'])
      when 'checkout.session.async_payment_failed'
        handle_payment_failed(event['data']['object'])
      else
        Rails.logger.info("Stripe webhook: unhandled event type #{event['type']}")
      end

      head :ok
    end

    private

    def verify_event(payload, sig_header)
      secret = ENV['STRIPE_WEBHOOK_SECRET']

      # In development without webhook secret, parse the raw payload
      if secret.blank?
        Rails.logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature verification')
        return JSON.parse(payload, symbolize_names: false)
      end

      Stripe::Webhook.construct_event(payload, sig_header, secret)
    rescue JSON::ParserError => e
      Rails.logger.error("Stripe webhook: invalid JSON — #{e.message}")
      nil
    rescue Stripe::SignatureVerificationError => e
      Rails.logger.error("Stripe webhook: invalid signature — #{e.message}")
      nil
    end

    def handle_checkout_completed(session)
      location_id = session.dig('metadata', 'location_id')
      customer_id = session.dig('metadata', 'customer_id') || session.dig('metadata', 'user_email') || 'anonymous'

      Rails.logger.info("Stripe payment completed: session=#{session['id']} location=#{location_id} customer=#{customer_id}")

      # Record the payment
      payment = BlueprintPayment.find_or_initialize_by(stripe_session_id: session['id'])
      payment.update!(
        location_id: location_id || 'unknown',
        customer_id: customer_id,
        stripe_payment_intent_id: session['payment_intent'],
        customer_email: session['customer_email'] || session.dig('customer_details', 'email'),
        amount_cents: session['amount_total'] || 29900,
        currency: session['currency'] || 'usd',
        status: 'paid',
        paid_at: Time.current
      )

      # Track in Paid.ai
      PaidService.track_blueprint(
        customer_id: customer_id,
        location_id: location_id || 'unknown',
        location_name: location_id || 'unknown',
        revenue_usd: (payment.amount_cents / 100.0).round(2)
      )

      Rails.logger.info("Blueprint payment recorded: #{payment.id} for #{location_id}")
    rescue StandardError => e
      Rails.logger.error("Stripe webhook handler error: #{e.message}")
      # Still return 200 to Stripe so it doesn't retry
    end

    def handle_payment_failed(session)
      payment = BlueprintPayment.find_by(stripe_session_id: session['id'])
      payment&.update!(status: 'failed')
      Rails.logger.warn("Stripe payment failed: session=#{session['id']}")
    rescue StandardError => e
      Rails.logger.error("Stripe webhook handler error: #{e.message}")
    end
  end
end
