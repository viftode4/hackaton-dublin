# frozen_string_literal: true

class CompareLocationsInput < Anthropic::BaseModel
  required :location_ids, Anthropic::ArrayOf[String]
end

class CompareLocations < Anthropic::BaseTool
  description "Compare multiple data center locations side-by-side. Provide 2-5 location IDs to get a detailed comparison of energy costs, carbon footprint, latency, construction costs, and risk factors."

  input_schema CompareLocationsInput

  def call(input)
    locations = input.location_ids.filter_map { |id| LocationService.find(id) }

    return "No valid locations found for IDs: #{input.location_ids.join(', ')}" if locations.empty?

    comparison = locations.map do |loc|
      {
        id: loc[:id],
        name: loc[:name],
        body: loc[:body],
        energy_cost_kwh: loc[:energy_cost_kwh],
        carbon_intensity_gco2: loc[:carbon_intensity_gco2],
        avg_temperature_c: loc[:avg_temperature_c],
        cooling_method: loc[:cooling_method],
        cooling_cost_factor: loc[:cooling_cost_factor],
        land_cost_sqm: loc[:land_cost_sqm],
        construction_cost_mw: loc[:construction_cost_mw],
        latency_ms: loc[:latency_ms],
        disaster_risk: loc[:disaster_risk],
        political_stability: loc[:political_stability],
        energy_sources: loc[:energy_sources],
        special_factors: loc[:special_factors]
      }
    end

    comparison.to_json
  end
end
