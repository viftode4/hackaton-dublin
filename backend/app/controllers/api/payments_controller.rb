# frozen_string_literal: true

module Api
  class PaymentsController < ApplicationController
    # POST /api/payments/checkout
    # Create a Stripe checkout session for blueprint purchase
    def checkout
      unless params[:location_id].present? && params[:location_name].present?
        return render json: {
          error: 'location_id and location_name required'
        }, status: :bad_request
      end

      begin
        # Blueprint purchase price (in cents)
        blueprint_price_cents = 29900  # $299.00

        # Create Stripe checkout session
        session = Stripe::Checkout::Session.create(
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: "Data Center Feasibility Blueprint",
                  description: "Comprehensive blueprint for #{params[:location_name]} (#{params[:location_id]})",
                  metadata: {
                    location_id: params[:location_id]
                  }
                },
                unit_amount: blueprint_price_cents
              },
              quantity: 1
            }
          ],
          mode: 'payment',
          success_url: ENV['STRIPE_SUCCESS_URL'] || "#{origin}/success?session_id={CHECKOUT_SESSION_ID}",
          cancel_url: ENV['STRIPE_CANCEL_URL'] || "#{origin}/cancel",
          customer_email: params[:email].presence,
          metadata: {
            location_id: params[:location_id],
            customer_id: customer_id,
            user_email: params[:email] || 'guest@orbital.local'
          }
        )

        # Record pending payment
        BlueprintPayment.create!(
          location_id: params[:location_id],
          customer_id: customer_id,
          stripe_session_id: session.id,
          customer_email: params[:email],
          amount_cents: blueprint_price_cents,
          currency: 'usd',
          status: 'pending'
        )

        render json: {
          checkout_url: session.url,
          session_id: session.id,
          amount_cents: blueprint_price_cents,
          currency: 'usd'
        }
      rescue Stripe::Error => e
        Rails.logger.error("Stripe error: #{e.message}")
        render json: {
          error: "Payment processing failed: #{e.message}"
        }, status: :unprocessable_entity
      end
    end

    # GET /api/payments/session/:session_id
    # Check payment status
    def session_status
      begin
        session = Stripe::Checkout::Session.retrieve(params[:session_id])

        render json: {
          status: session.payment_status,
          customer_email: session.customer_email,
          amount_total: session.amount_total,
          amount_subtotal: session.amount_subtotal,
          currency: session.currency,
          location_id: session.metadata&.dig('location_id'),
          paid: session.payment_status == 'paid'
        }
      rescue Stripe::InvalidRequestError => e
        Rails.logger.error("Stripe session not found: #{e.message}")
        render json: {
          error: "Session not found: #{params[:session_id]}"
        }, status: :not_found
      rescue Stripe::Error => e
        Rails.logger.error("Stripe error: #{e.message}")
        render json: {
          error: "Payment lookup failed: #{e.message}"
        }, status: :unprocessable_entity
      end
    end

    # GET /api/payments/check?location_id=X&customer_id=Y
    # Check if blueprint has been purchased
    def check_blueprint_payment
      unless params[:location_id].present?
        return render json: { error: 'location_id required' }, status: :bad_request
      end

      paid = BlueprintPayment.paid_for?(
        customer_id: customer_id,
        location_id: params[:location_id]
      )

      render json: {
        paid: paid,
        location_id: params[:location_id],
        customer_id: customer_id
      }
    end

    private

    def customer_id
      params[:customer_id] || request.headers['X-Customer-ID'] || 'anonymous'
    end

    def origin
      request.base_url
    end
  end
end
