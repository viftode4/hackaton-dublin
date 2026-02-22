# frozen_string_literal: true

require 'net/http'
require 'json'
require 'uri'

module Api
  class SolanaController < ApplicationController
    SOLANA_SERVICE_URL = ENV.fetch('SOLANA_SERVICE_URL', 'http://host.docker.internal:3001')

    # POST /api/solana/mint
    def mint
      unless params[:location_id].present? && params[:inventory_id].present?
        return render json: {
          error: 'location_id and inventory_id required'
        }, status: :bad_request
      end

      inventory = Inventory.find(params[:inventory_id])
      location = LocationService.find(params[:location_id]) || {
        id: params[:location_id],
        name: inventory.name
      }

      result = mint_on_solana(location, inventory)

      inventory.update(solana_tx_hash: result['signature'])

      # Track Solana mint event via Paid.ai
      PaidService.track_mint(
        customer_id: params[:customer_id] || request.headers['X-Customer-ID'] || 'anonymous',
        location_id: params[:location_id],
        tx_hash: result['signature'],
        inventory_name: inventory.name
      )

      render json: {
        tx_hash: result['signature'],
        explorer_url: result['explorer_url'],
        memo_content: result['memo_content']
      }, status: :created
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'Inventory not found' }, status: :not_found
    rescue StandardError => e
      Rails.logger.error("Solana mint error: #{e.message}")
      render json: { error: "Mint failed: #{e.message}" }, status: :internal_server_error
    end

    private

    def mint_on_solana(location, inventory)
      if ENV['SOLANA_MOCK'].present?
        return mock_response(location, inventory)
      end

      call_solana_service(location, inventory)
    end

    def call_solana_service(location, inventory)
      uri = URI("#{SOLANA_SERVICE_URL}/mint")
      http = Net::HTTP.new(uri.host, uri.port)
      http.open_timeout = 5
      http.read_timeout = 30

      request = Net::HTTP::Post.new(uri)
      request['Content-Type'] = 'application/json'
      request.body = {
        location_id: location[:id],
        name: inventory.name,
        capacity_mw: inventory.capacity_mw,
        grade: nil,
        report_hash: nil
      }.to_json

      response = http.request(request)

      unless response.is_a?(Net::HTTPSuccess)
        error = JSON.parse(response.body) rescue { 'error' => response.body }
        raise "Solana service error: #{error['error'] || response.code}"
      end

      JSON.parse(response.body)
    end

    def mock_response(location, inventory)
      sig = "5K4v#{SecureRandom.hex(30)}"
      {
        'signature' => sig,
        'explorer_url' => "https://explorer.solana.com/tx/#{sig}?cluster=devnet",
        'memo_content' => {
          'type' => 'orbital-atlas-dc-record',
          'location_id' => location[:id],
          'name' => inventory.name
        }
      }
    end
  end
end
