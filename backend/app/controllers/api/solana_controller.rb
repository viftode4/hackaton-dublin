# frozen_string_literal: true

module Api
  class SolanaController < ApplicationController
    # POST /api/solana/mint
    # Mints a data center record on Solana blockchain
    # TODO: Implement integration with P4's Solana service
    def mint
      unless params[:location_id].present? && params[:inventory_id].present?
        return render json: {
          error: 'location_id and inventory_id required'
        }, status: :bad_request
      end

      inventory = Inventory.find(params[:inventory_id])
      location = LocationService.find(params[:location_id])

      unless inventory && location
        return render json: {
          error: 'Inventory or location not found'
        }, status: :not_found
      end

      # Call Solana service (from P4) or use mock
      tx_hash = mint_on_solana(location, inventory)

      # Update inventory with tx hash
      inventory.update(solana_tx_hash: tx_hash)

      render json: {
        tx_hash: tx_hash,
        explorer_url: "https://explorer.solana.com/tx/#{tx_hash}?cluster=devnet"
      }, status: :created
    rescue StandardError => e
      Rails.logger.error("Solana mint error: #{e.message}")
      render json: { error: "Mint failed: #{e.message}" }, status: :internal_server_error
    end

    private

    def mint_on_solana(location, inventory)
      # TODO: Replace with real implementation when P4 provides it
      if ENV['SOLANA_MOCK'].present?
        mock_tx_hash
      else
        call_solana_service(location, inventory)
      end
    end

    def call_solana_service(location, inventory)
      # TODO: Implement call to Solana service from P4
      mock_tx_hash
    end

    def mock_tx_hash
      # Generate a mock Solana tx hash for development
      "5K4v#{SecureRandom.hex(30)}"
    end
  end
end
