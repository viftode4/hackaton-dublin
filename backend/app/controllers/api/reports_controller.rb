# frozen_string_literal: true

module Api
  class ReportsController < ApplicationController
    # POST /api/reports/scorecard
    # Generates a feasibility scorecard for a location
    # TODO: Implement full integration with ClaudeService
    def scorecard
      location = LocationService.find(params[:location_id])

      # Accept inline location data for live satellites / dynamic locations not in the store
      if !location && params[:location_data].present?
        location = params[:location_data].to_unsafe_h.deep_symbolize_keys
      end

      unless location
        return render json: { error: "Location not found: #{params[:location_id]}" },
                      status: :not_found
      end

      inventory = Inventory.all.as_json
      result = ClaudeService.generate_scorecard(location, inventory)

      # Track AI usage via Paid.ai
      unless result.is_a?(Hash) && result[:error]
        PaidService.track_scorecard(
          customer_id: customer_id,
          location_id: params[:location_id],
          location_name: location[:name] || params[:location_id],
          tokens_used: result[:tokens_used] || 0,
          cost_usd: result[:cost_usd] || 0
        )
      end

      render json: result
    end

    # POST /api/reports/blueprint
    # Generates a detailed blueprint for a location (PAID — requires Stripe payment)
    def blueprint
      location = LocationService.find(params[:location_id])

      # Accept inline location data for live satellites / dynamic locations not in the store
      if !location && params[:location_data].present?
        location = params[:location_data].to_unsafe_h.deep_symbolize_keys
      end

      unless location
        return render json: { error: "Location not found: #{params[:location_id]}" },
                      status: :not_found
      end

      # Gate behind payment — check if customer has paid for this location's blueprint
      unless BlueprintPayment.paid_for?(customer_id: customer_id, location_id: params[:location_id])
        return render json: {
          error: 'Payment required',
          message: 'A blueprint purchase is required before generating. Use POST /api/payments/checkout to start.',
          location_id: params[:location_id],
          price: '$299.00'
        }, status: :payment_required
      end

      inventory = Inventory.all.as_json
      scorecard = params[:scorecard] || {}

      result = ClaudeService.generate_blueprint(location, scorecard, inventory)

      # Track AI usage via Paid.ai
      unless result.is_a?(Hash) && result[:error]
        PaidService.track_blueprint(
          customer_id: customer_id,
          location_id: params[:location_id],
          location_name: location[:name] || params[:location_id],
          tokens_used: result[:tokens_used] || 0,
          cost_usd: result[:cost_usd] || 0
        )

        # Store generated blueprint content in the payment record
        payment = BlueprintPayment.paid.for_customer(customer_id).for_location(params[:location_id]).order(paid_at: :desc).first
        if payment
          payment.update(
            blueprint_content: result.to_json,
            location_name: location[:name] || params[:location_id]
          )
        end
      end

      render json: result
    end

    private

    def customer_id
      params[:customer_id] || request.headers['X-Customer-ID'] || 'anonymous'
    end
  end
end
