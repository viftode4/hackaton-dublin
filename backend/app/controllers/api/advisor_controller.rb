# frozen_string_literal: true

module Api
  class AdvisorController < ApplicationController
    # POST /api/advisor/chat
    # Agentic chat — Claude uses tools to research before answering
    def chat
      unless params[:message].present?
        return render json: { error: 'message parameter required' }, status: :bad_request
      end

      history = params[:history] || []

      result = ClaudeService.chat(params[:message], [], history)

      if result[:error]
        render json: { error: result[:error] }, status: :unprocessable_entity
      else
        # Track AI usage via Paid.ai
        PaidService.track_chat(
          customer_id: customer_id,
          message: params[:message],
          tools_used: result[:tools_used] || [],
          tokens_used: result[:tokens_used] || 0,
          cost_usd: result[:cost_usd] || 0
        )

        render json: {
          message: result[:response],
          role: 'assistant',
          tools_used: result[:tools_used] || [],
          agent: result[:agent] || false
        }
      end
    end

    # POST /api/advisor/recommend
    # Agentic recommendation — Claude uses tools to find best locations
    def recommend
      unless params[:requirements].present?
        return render json: { error: 'requirements parameter required' }, status: :bad_request
      end

      result = ClaudeService.recommend(params[:requirements])

      # Track AI usage via Paid.ai
      unless result[:error]
        locations_count = result.is_a?(Hash) ? (result['recommendations'] || result[:recommendations] || []).length : 0
        PaidService.track_recommendation(
          customer_id: customer_id,
          requirements: params[:requirements],
          locations_recommended: locations_count,
          tokens_used: result[:tokens_used] || 0,
          cost_usd: result[:cost_usd] || 0
        )
      end

      render json: result
    end

    private

    def customer_id
      params[:customer_id] || request.headers['X-Customer-ID'] || 'anonymous'
    end
  end
end
