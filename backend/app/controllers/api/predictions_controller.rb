# frozen_string_literal: true

module Api
  class PredictionsController < ApplicationController
    # POST /api/predict/co2
    #
    # Body: { country_ci: 380, emissions_per_capacity: 2000, pct_coal: 0.23, pct_clean: 0.19 }
    # Response: { co2_intensity_gco2: 342.1, model_type: "ridge_regression", confidence: 0.87 }
    def co2
      features = [
        params[:country_ci].to_f,
        params[:emissions_per_capacity].to_f,
        params[:pct_coal].to_f,
        params[:pct_clean].to_f
      ]

      if features.any? { |f| f.zero? && !params.values_at(:country_ci, :emissions_per_capacity, :pct_coal, :pct_clean).any? { |v| v.to_s == "0" } }
        return render json: { error: "Missing required features: country_ci, emissions_per_capacity, pct_coal, pct_clean" }, status: :unprocessable_entity
      end

      prediction = PredictionService.predict(features)
      info = PredictionService.model_info

      render json: {
        co2_intensity_gco2: prediction,
        model_type: info[:model_type],
        mae: info[:loo_mae],
        r2: info[:loo_r2],
        confidence: info[:loo_r2] || 0.87
      }
    rescue => e
      render json: { error: e.message }, status: :internal_server_error
    end

    # GET /api/predict/info
    def info
      render json: PredictionService.model_info
    rescue => e
      render json: { error: e.message }, status: :internal_server_error
    end
  end
end
