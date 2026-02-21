# frozen_string_literal: true

class CalculateCostsInput < Anthropic::BaseModel
  required :location_id, String
  required :capacity_mw, Float
  optional :utilization_pct, Float
end

class CalculateCosts < Anthropic::BaseTool
  description "Calculate estimated costs for building and operating a data center at a specific location. Provide the location ID and desired capacity in MW. Returns construction costs, monthly operating costs, energy costs, and carbon footprint estimates."

  input_schema CalculateCostsInput

  HOURS_PER_MONTH = 730

  def call(input)
    location = LocationService.find(input.location_id)
    return "Location '#{input.location_id}' not found." unless location

    capacity = input.capacity_mw
    utilization = input.respond_to?(:utilization_pct) && input.utilization_pct ? input.utilization_pct / 100.0 : 0.75

    energy_kwh_month = capacity * 1000 * HOURS_PER_MONTH * utilization
    energy_cost_month = energy_kwh_month * location[:energy_cost_kwh]
    cooling_cost_month = energy_cost_month * (location[:cooling_cost_factor] || 0.3)
    construction_cost = capacity * (location[:construction_cost_mw] || 10_000_000)
    land_cost = capacity * 500 * (location[:land_cost_sqm] || 500) # ~500 sqm per MW
    carbon_tons_year = energy_kwh_month * 12 * (location[:carbon_intensity_gco2] || 200) / 1_000_000

    {
      location: location[:name],
      capacity_mw: capacity,
      utilization_pct: (utilization * 100).round(1),
      construction_cost_usd: construction_cost.round(0),
      land_cost_usd: land_cost.round(0),
      total_capex_usd: (construction_cost + land_cost).round(0),
      monthly_energy_cost_usd: energy_cost_month.round(0),
      monthly_cooling_cost_usd: cooling_cost_month.round(0),
      monthly_total_opex_usd: (energy_cost_month + cooling_cost_month).round(0),
      annual_carbon_tons: carbon_tons_year.round(0),
      energy_sources: location[:energy_sources],
      payback_estimate_years: ((construction_cost + land_cost) / ((energy_cost_month + cooling_cost_month) * 12 * 0.3)).round(1) # Assuming 30% margin
    }.to_json
  end
end
