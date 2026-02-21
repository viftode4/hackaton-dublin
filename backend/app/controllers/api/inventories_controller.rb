# frozen_string_literal: true

module Api
  class InventoriesController < ApplicationController
    before_action :set_inventory, only: [:show, :update, :destroy]

    # GET /api/inventories
    def index
      @inventories = Inventory.all
      @inventories = @inventories.where(location_id: LocationService.by_body(params[:body]).map { |l| l[:id] }) if params[:body].present?
      render json: @inventories
    end

    # GET /api/inventories/:id
    def show
      render json: @inventory
    end

    # POST /api/inventories
    def create
      @inventory = Inventory.new(inventory_params)

      if @inventory.save
        render json: @inventory, status: :created, location: api_inventory_url(@inventory)
      else
        render json: { errors: @inventory.errors.full_messages }, status: :unprocessable_entity
      end
    end

    # PATCH /api/inventories/:id
    def update
      if @inventory.update(inventory_params)
        render json: @inventory
      else
        render json: { errors: @inventory.errors.full_messages }, status: :unprocessable_entity
      end
    end

    # DELETE /api/inventories/:id
    def destroy
      @inventory.destroy
      head :no_content
    end

    private

    def set_inventory
      @inventory = Inventory.find(params[:id])
    rescue ActiveRecord::RecordNotFound
      render json: { error: 'Inventory item not found' }, status: :not_found
    end

    def inventory_params
      params.require(:inventory).permit(
        :location_id, :name, :capacity_mw, :utilization_pct,
        :carbon_footprint_tons, :power_source, :monthly_cost, :solana_tx_hash,
        workload_types: []
      )
    end
  end
end
