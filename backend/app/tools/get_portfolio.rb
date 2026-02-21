# frozen_string_literal: true

class GetPortfolioInput < Anthropic::BaseModel
  # No required inputs - returns full portfolio
end

class GetPortfolio < Anthropic::BaseTool
  description "Get the user's current data center portfolio including all sites, their capacities, utilization, carbon footprint, costs, and aggregate statistics. Use this to understand what the user already has before making recommendations."

  input_schema GetPortfolioInput

  def call(_input)
    inventory = Inventory.all

    sites = inventory.map do |item|
      location = LocationService.find(item.location_id)
      {
        id: item.id,
        name: item.name,
        location_id: item.location_id,
        location_name: location&.dig(:name) || 'Unknown',
        body: location&.dig(:body) || 'unknown',
        capacity_mw: item.capacity_mw,
        utilization_pct: item.utilization_pct,
        carbon_footprint_tons: item.carbon_footprint_tons,
        power_source: item.power_source,
        monthly_cost: item.monthly_cost,
        on_chain: item.solana_tx_hash.present?
      }
    end

    stats = {
      total_sites: inventory.count,
      total_capacity_mw: inventory.sum(:capacity_mw),
      avg_utilization_pct: (inventory.average(:utilization_pct) || 0).round(1),
      total_carbon_tons: inventory.sum(:carbon_footprint_tons),
      total_monthly_cost: inventory.sum(:monthly_cost),
      on_chain_count: inventory.where.not(solana_tx_hash: nil).count
    }

    { sites: sites, stats: stats }.to_json
  end
end
