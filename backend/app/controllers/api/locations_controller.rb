# frozen_string_literal: true

module Api
  class LocationsController < ApplicationController
    # GET /api/locations
    # GET /api/locations?body=earth
    # GET /api/locations?search=iceland
    def index
      @locations = LocationService.all

      if params[:body].present?
        @locations = LocationService.by_body(params[:body])
      elsif params[:search].present?
        @locations = LocationService.search(params[:search])
      end

      render json: @locations
    end

    # GET /api/locations/:id
    def show
      @location = LocationService.find(params[:id])

      if @location.present?
        render json: @location
      else
        render json: { error: "Location '#{params[:id]}' not found" }, status: :not_found
      end
    end
  end
end
