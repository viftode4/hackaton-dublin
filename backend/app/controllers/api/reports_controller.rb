# frozen_string_literal: true

module Api
  class ReportsController < ApplicationController
    # POST /api/reports/scorecard
    # Generates a feasibility scorecard for a location
    # TODO: Implement full integration with ClaudeService
    def scorecard
      location = LocationService.find(params[:location_id])

      unless location
        return render json: { error: "Location not found: #{params[:location_id]}" },
                      status: :not_found
      end

      inventory = Inventory.all.as_json
      result = ClaudeService.generate_scorecard(location, inventory)

      render json: result
    end

    # POST /api/reports/blueprint
    # Generates a detailed blueprint for a location
    # TODO: Implement full integration with ClaudeService
    def blueprint
      location = LocationService.find(params[:location_id])

      unless location
        return render json: { error: "Location not found: #{params[:location_id]}" },
                      status: :not_found
      end

      inventory = Inventory.all.as_json
      scorecard = params[:scorecard] || {}

      result = ClaudeService.generate_blueprint(location, scorecard, inventory)

      render json: result
    end
  end
end
