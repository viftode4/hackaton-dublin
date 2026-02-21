# frozen_string_literal: true

module Api
  class PaymentsController < ApplicationController
    # POST /api/payments/checkout
    # Create a Stripe checkout session for blueprint purchase
    # TODO: Implement full Stripe integration
    def checkout
      unless params[:location_id].present? && params[:location_name].present?
        return render json: {
          error: 'location_id and location_name required'
        }, status: :bad_request
      end

      # TODO: Call Stripe API to create session
      # For now, return placeholder

      render json: {
        checkout_url: "https://checkout.stripe.com/placeholder",
        session_id: "sess_placeholder"
      }
    end

    # GET /api/payments/session/:session_id
    # Check payment status
    # TODO: Implement full Stripe integration
    def session_status
      # TODO: Call Stripe API to get session status

      render json: {
        status: "unpaid",
        customer_email: nil,
        location_id: params[:session_id]
      }
    end
  end
end
