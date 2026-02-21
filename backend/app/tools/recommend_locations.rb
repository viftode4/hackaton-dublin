# frozen_string_literal: true

class RecommendLocationsInput < Anthropic::BaseModel
  optional :workload_type, String
  optional :max_carbon_intensity, Integer
  optional :max_energy_cost, Float
  optional :target_region, String
  optional :max_disaster_risk, Integer
end

class RecommendLocations < Anthropic::BaseTool
  description "Get filtered location recommendations based on specific criteria like workload type, carbon limits, energy cost caps, target region, or disaster risk tolerance. Returns ranked locations matching the criteria."

  input_schema RecommendLocationsInput

  def call(input)
    locations = LocationService.all

    if input.respond_to?(:max_carbon_intensity) && input.max_carbon_intensity
      locations = locations.select { |l| (l[:carbon_intensity_gco2] || 999) <= input.max_carbon_intensity }
    end

    if input.respond_to?(:max_energy_cost) && input.max_energy_cost
      locations = locations.select { |l| (l[:energy_cost_kwh] || 999) <= input.max_energy_cost }
    end

    if input.respond_to?(:max_disaster_risk) && input.max_disaster_risk
      locations = locations.select { |l| (l[:disaster_risk] || 999) <= input.max_disaster_risk }
    end

    if input.respond_to?(:target_region) && input.target_region.present?
      region = input.target_region.downcase
      locations = locations.select do |l|
        l[:name].downcase.include?(region) ||
          l[:body].downcase.include?(region) ||
          l[:regulatory]&.downcase&.include?(region)
      end
    end

    # Sort by a composite score (lower is better)
    ranked = locations.sort_by do |l|
      (l[:energy_cost_kwh] || 1) * 100 +
        (l[:carbon_intensity_gco2] || 500) * 0.01 +
        (l[:disaster_risk] || 50) * 0.5 -
        (l[:political_stability] || 50) * 0.3
    end

    ranked.first(5).map do |loc|
      {
        id: loc[:id],
        name: loc[:name],
        body: loc[:body],
        energy_cost_kwh: loc[:energy_cost_kwh],
        carbon_intensity_gco2: loc[:carbon_intensity_gco2],
        disaster_risk: loc[:disaster_risk],
        political_stability: loc[:political_stability],
        special_factors: loc[:special_factors]
      }
    end.to_json
  end
end
