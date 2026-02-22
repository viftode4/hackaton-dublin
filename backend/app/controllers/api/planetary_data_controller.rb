# frozen_string_literal: true

module Api
  class PlanetaryDataController < ApplicationController
    DATA_DIR = Rails.root.join('..', 'frontend', 'public', 'data')

    # GET /api/planetary/moon/features
    # GET /api/planetary/mars/features
    # GET /api/planetary/mars/geology
    # GET /api/planetary/mars/dust
    def show
      body = params[:body]
      dataset = params[:dataset]

      unless %w[moon mars].include?(body)
        render json: { error: "Unknown body: #{body}" }, status: :bad_request
        return
      end

      file = DATA_DIR.join("#{body}-#{dataset}.json")

      if File.exist?(file)
        render json: File.read(file), content_type: 'application/json'
      else
        render json: { error: "Dataset #{body}/#{dataset} not found" }, status: :not_found
      end
    end
  end
end
