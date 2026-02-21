# frozen_string_literal: true

module Api
  class PortfolioController < ApplicationController
    # GET /api/portfolio/stats
    # Aggregates portfolio analytics and metrics
    # TODO: Implement full analytics calculation
    def stats
      inventory = Inventory.all

      stats = {
        total_capacity_mw: inventory.sum(:capacity_mw),
        total_carbon_tons: inventory.sum(:carbon_footprint_tons),
        total_monthly_cost: inventory.sum(:monthly_cost),
        avg_utilization_pct: (inventory.average(:utilization_pct) || 0).round(1),
        site_count: inventory.count,
        bodies: calculate_body_distribution(inventory),
        coverage: calculate_regional_coverage(inventory),
        efficiency_metrics: calculate_efficiency(inventory)
      }

      render json: stats
    end

    private

    def calculate_body_distribution(inventory)
      bodies = {}
      inventory.each do |item|
        loc = LocationService.find(item.location_id)
        next unless loc
        body = loc[:body] || 'unknown'
        bodies[body] = (bodies[body] || 0) + 1
      end
      bodies
    end

    def calculate_regional_coverage(inventory)
      regions = {
        europe: false,
        north_america: false,
        asia_pacific: false,
        latam: false,
        africa: false,
        moon: false,
        mars: false
      }

      inventory.each do |item|
        loc = LocationService.find(item.location_id)
        next unless loc

        body = loc[:body]&.downcase
        case body
        when 'earth'
          latency = loc[:latency_ms] || {}
          regions[:europe] = true if (latency[:eu] || 999) < 50
          regions[:north_america] = true if (latency[:us] || 999) < 50
          regions[:asia_pacific] = true if (latency[:apac] || 999) < 50
        when 'moon'
          regions[:moon] = true
        when 'mars'
          regions[:mars] = true
        end
      end

      regions
    end

    def calculate_efficiency(inventory)
      return {} if inventory.empty?

      {
        avg_carbon_per_mw: (inventory.sum(:carbon_footprint_tons) / inventory.sum(:capacity_mw)).round(1),
        renewable_estimate: calculate_renewable_pct(inventory),
        cost_per_mw_monthly: (inventory.sum(:monthly_cost) / inventory.sum(:capacity_mw)).round(0)
      }
    end

    def calculate_renewable_pct(inventory)
      renewable_count = 0
      inventory.each do |item|
        source = item.power_source&.downcase
        renewable_count += 1 if source&.include?('renewable') ||
                                source&.include?('hydro') ||
                                source&.include?('geothermal') ||
                                source&.include?('wind') ||
                                source&.include?('solar')
      end

      ((renewable_count.to_f / inventory.count) * 100).round(1)
    end
  end
end
