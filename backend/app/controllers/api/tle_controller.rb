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

      data = fetch_from_celestrak(query) || fetch_from_alt_api(params[:catnr])

      if data
        @@tle_cache[cache_key] = data
        @@cache_expiry[cache_key] = Time.now + CACHE_DURATION
        render json: data
      else
        render json: { error: 'All TLE sources unavailable' }, status: :service_unavailable
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

    def fetch_from_celestrak(query)
      uri = URI("https://celestrak.org/NORAD/elements/gp.php?#{query}&FORMAT=JSON")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = true
      http.open_timeout = 5
      http.read_timeout = 10
      response = http.get(uri.request_uri)
      return JSON.parse(response.body) if response.is_a?(Net::HTTPSuccess)

      nil
    rescue StandardError => e
      Rails.logger.warn("CelesTrak fetch failed: #{e.message}")
      nil
    end

    ALT_TLE_BASE = 'https://tle.ivanstanojevic.me/api/tle/'

    def fetch_from_alt_api(catnr = nil)
      if catnr
        uri = URI("#{ALT_TLE_BASE}#{catnr}")
        http = Net::HTTP.new(uri.host, uri.port)
        http.use_ssl = true
        http.open_timeout = 5
        http.read_timeout = 10
        response = http.get(uri.request_uri)
        return nil unless response.is_a?(Net::HTTPSuccess)

        item = JSON.parse(response.body)
        [alt_to_celestrak_format(item)]
      else
        # Fetch paginated results from alt API
        all_records = []
        (1..5).each do |page|
          uri = URI("#{ALT_TLE_BASE}?page=#{page}&page_size=20")
          http = Net::HTTP.new(uri.host, uri.port)
          http.use_ssl = true
          http.open_timeout = 5
          http.read_timeout = 10
          response = http.get(uri.request_uri)
          break unless response.is_a?(Net::HTTPSuccess)

          data = JSON.parse(response.body)
          members = data['member'] || []
          break if members.empty?

          members.each { |item| all_records << alt_to_celestrak_format(item) }
        end
        all_records.empty? ? nil : all_records
      end
    rescue StandardError => e
      Rails.logger.warn("Alt TLE API failed: #{e.message}")
      nil
    end

    def alt_to_celestrak_format(item)
      line1 = item['line1'] || ''
      line2 = item['line2'] || ''
      {
        'OBJECT_NAME' => item['name'],
        'NORAD_CAT_ID' => item['satelliteId'],
        'TLE_LINE1' => line1,
        'TLE_LINE2' => line2,
        'EPOCH' => item['date'],
        'INCLINATION' => parse_float(line2, 8, 16),
        'RA_OF_ASC_NODE' => parse_float(line2, 17, 25),
        'ECCENTRICITY' => "0.#{line2[26..32].strip}".to_f,
        'ARG_OF_PERICENTER' => parse_float(line2, 34, 42),
        'MEAN_ANOMALY' => parse_float(line2, 43, 51),
        'MEAN_MOTION' => parse_float(line2, 52, 63)
      }
    end

    def parse_float(line, from, to)
      return 0.0 if line.length < to

      line[from..to].strip.to_f
    end
  end
end
