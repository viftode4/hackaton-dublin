# frozen_string_literal: true

module Api
  class AdvisorController < ApplicationController
    # POST /api/advisor/chat
    # Chat with AI advisor about data center infrastructure
    # TODO: Implement streaming via SSE
    def chat
      unless params[:message].present?
        return render json: { error: 'message parameter required' }, status: :bad_request
      end

      inventory = Inventory.all.as_json
      history = params[:history] || []

      result = ClaudeService.chat(params[:message], inventory, history: history)

      render json: {
        message: result,
        role: 'assistant'
      }
    end

    # POST /api/advisor/recommend
    # Get location recommendations based on requirements
    # TODO: Implement integration with ClaudeService
    def recommend
      unless params[:requirements].present?
        return render json: { error: 'requirements parameter required' }, status: :bad_request
      end

      inventory = Inventory.all.as_json
      result = ClaudeService.recommend(params[:requirements], inventory)

      render json: result
    end
  end
end
