# frozen_string_literal: true

# Loads the trained Ridge regression model and predicts CO2 intensity
# for a datacenter location based on country-level energy features.
#
# Model features:
#   country_ci          — country grid carbon intensity (g CO₂/kWh)
#   emissions_per_capacity — total emissions / installed capacity (t/MW)
#   local_pct_coal      — fraction of electricity from coal (0–1)
#   local_pct_clean     — fraction from clean sources: hydro+nuclear+wind+solar+geo (0–1)
class PredictionService
  MODEL_PATH = Rails.root.join("../trained_model.json")

  class << self
    def predict(features)
      model = load_model

      # Scale features: z = (x - mean) / std
      scaled = model["features"].each_with_index.map do |_name, i|
        (features[i] - model["scaler_mean"][i]) / model["scaler_scale"][i]
      end

      # Linear prediction: y = intercept + sum(coef * scaled)
      prediction = model["intercept"]
      model["coefficients"].each_with_index do |coef, i|
        prediction += coef * scaled[i]
      end

      # Clamp to reasonable range
      prediction.clamp(10.0, 1200.0).round(1)
    end

    def model_info
      model = load_model
      {
        model_type: model["model_type"],
        features: model["features"],
        training_samples: model["training_samples"],
        loo_mae: model["loo_mae"]&.round(1),
        loo_r2: model["loo_r2"]&.round(4),
        best_model: model["analytics_best_model"]
      }
    end

    private

    def load_model
      @model ||= JSON.parse(File.read(MODEL_PATH))
    rescue Errno::ENOENT
      raise "Trained model not found at #{MODEL_PATH}"
    end
  end
end
