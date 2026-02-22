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
          location_name: params[:location_name],
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
      rescue StandardError => e
        Rails.logger.error("Stripe checkout error: #{e.message}")
        render json: {
          error: "Payment processing failed: #{e.message}"
        }, status: :unprocessable_entity
      end
    end

    # GET /api/payments/session/:session_id
    # Check payment status — also falls back to local DB if Stripe API fails
    def session_status
      # First try local DB (fast, no external call)
      payment = BlueprintPayment.find_by(stripe_session_id: params[:session_id])
      if payment&.paid?
        return render json: {
          status: 'paid',
          paid: true,
          location_id: payment.location_id,
          customer_email: payment.customer_email,
          amount_total: payment.amount_cents,
          currency: payment.currency
        }
      end

      # Fall back to Stripe API for real-time status
      begin
        session = Stripe::Checkout::Session.retrieve(params[:session_id])

        location_id = begin
          session.metadata['location_id']
        rescue
          nil
        end

        paid = session.payment_status == 'paid'

        # Update local record if paid
        if paid && payment
          payment.update(status: 'paid', paid_at: Time.current)
        end

        render json: {
          status: session.payment_status,
          customer_email: session.customer_email,
          amount_total: session.amount_total,
          currency: session.currency,
          location_id: location_id,
          paid: paid
        }
      rescue StandardError => e
        Rails.logger.error("Stripe session lookup error: #{e.message}")
        # If Stripe API fails, return what we know from DB
        render json: {
          status: payment&.status || 'unknown',
          paid: payment&.paid? || false,
          location_id: payment&.location_id,
          error: nil
        }
      end
    end

    # GET /api/payments/blueprints
    # List all purchased blueprints for a customer
    def blueprints
      payments = BlueprintPayment.paid.for_customer(customer_id).order(paid_at: :desc)

      render json: payments.map { |p|
        {
          id: p.id,
          location_id: p.location_id,
          location_name: p.location_name,
          paid_at: p.paid_at,
          has_content: p.blueprint_content.present?,
          solana_tx_hash: p.solana_tx_hash
        }
      }
    end

    # GET /api/payments/blueprint/:id
    # Get a specific blueprint's content
    def blueprint
      payment = BlueprintPayment.paid.for_customer(customer_id).find_by(id: params[:id])

      unless payment
        return render json: { error: 'Blueprint not found' }, status: :not_found
      end

      content = payment.blueprint_content.present? ? JSON.parse(payment.blueprint_content) : nil

      render json: {
        id: payment.id,
        location_id: payment.location_id,
        location_name: payment.location_name,
        paid_at: payment.paid_at,
        solana_tx_hash: payment.solana_tx_hash,
        content: content
      }
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
