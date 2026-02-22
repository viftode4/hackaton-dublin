# frozen_string_literal: true

require 'net/http'
require 'json'

module Api
  class TleController < ApplicationController
    # Cache TLE data in memory — refreshes every 24 hours
    @@tle_cache = {}
    @@cache_expiry = {}
    CACHE_DURATION = 24.hours

    # GET /api/tle?group=stations
    # GET /api/tle?catnr=25544
    def index
      group = params[:group] || 'stations'
      cache_key = params[:catnr] || params[:name] || group

      if cached_fresh?(cache_key)
        render json: @@tle_cache[cache_key]
        return
      end

      query = if params[:catnr]
                "CATNR=#{params[:catnr]}"
              elsif params[:name]
                "NAME=#{params[:name]}"
              else
                "GROUP=#{group}"
              end

      uri = URI("https://celestrak.org/NORAD/elements/gp.php?#{query}&FORMAT=JSON")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 10
      http.read_timeout = 15
      response = http.get(uri.request_uri)

      if response.is_a?(Net::HTTPSuccess)
        data = JSON.parse(response.body)
        @@tle_cache[cache_key] = data
        @@cache_expiry[cache_key] = Time.now + CACHE_DURATION
        render json: data
      else
        render json: { error: "CelesTrak returned #{response.code}" }, status: :bad_gateway
      end
    rescue StandardError => e
      if @@tle_cache[cache_key]
        render json: @@tle_cache[cache_key]
      else
        render json: { error: e.message }, status: :service_unavailable
      end
    end

    private

    def cached_fresh?(key)
      @@tle_cache[key] && @@cache_expiry[key] && Time.now < @@cache_expiry[key]
    end
  end
end
