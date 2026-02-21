# frozen_string_literal: true

require 'paid_ruby'

# PaidService — AI agent usage metering via Paid.ai
#
# Tracks every AI interaction as a Signal for:
#   - Cost visibility (how much each Claude call costs us)
#   - Usage metering (scorecards, blueprints, chats, recommendations per customer)
#   - Outcome-based billing (free scorecard → paid blueprint → track conversion)
#   - Agent profitability (revenue per customer vs. AI inference cost)
#
# Products registered in Paid:
#   - orbital-atlas-scorecard:  Free feasibility scorecard (lead gen / teaser)
#   - orbital-atlas-blueprint:  Paid detailed blueprint ($299 via Stripe)
#   - orbital-atlas-advisor:    AI advisor chat turn (usage-based)
#   - orbital-atlas-recommend:  AI-powered location recommendation
#   - orbital-atlas-mint:       Solana on-chain minting event
#
class PaidService
  AGENT_ID = '9de0c57f-d354-4a0d-abb9-fcafe077d0cd'

  # Product IDs — these match what's configured in the Paid dashboard
  PRODUCTS = {
    scorecard: 'orbital-atlas-scorecard',
    blueprint: 'orbital-atlas-blueprint',
    advisor: 'orbital-atlas-advisor',
    recommend: 'orbital-atlas-recommend',
    mint: 'orbital-atlas-mint'
  }.freeze

  class << self
    # Record an AI scorecard generation
    def track_scorecard(customer_id:, location_id:, location_name:, tokens_used: 0, cost_usd: 0)
      record_signal(
        event_name: 'scorecard_generated',
        customer_id: customer_id,
        data: {
          product: PRODUCTS[:scorecard],
          location_id: location_id,
          location_name: location_name,
          tokens_used: tokens_used,
          model: ClaudeService::MODEL,
          outcome: 'feasibility_score_delivered',
          costData: cost_data('anthropic', cost_usd)
        }
      )
    end

    # Record an AI blueprint generation (paid product)
    def track_blueprint(customer_id:, location_id:, location_name:, tokens_used: 0, cost_usd: 0, revenue_usd: 299)
      record_signal(
        event_name: 'blueprint_generated',
        customer_id: customer_id,
        data: {
          product: PRODUCTS[:blueprint],
          location_id: location_id,
          location_name: location_name,
          tokens_used: tokens_used,
          model: ClaudeService::MODEL,
          outcome: 'detailed_blueprint_delivered',
          revenue_usd: revenue_usd,
          costData: cost_data('anthropic', cost_usd)
        }
      )
    end

    # Record an AI advisor chat turn (agentic — may use multiple tool calls)
    def track_chat(customer_id:, message:, tools_used: [], tokens_used: 0, cost_usd: 0)
      record_signal(
        event_name: 'advisor_chat_turn',
        customer_id: customer_id,
        data: {
          product: PRODUCTS[:advisor],
          message_preview: message.to_s[0..100],
          tools_used: tools_used.map { |t| t[:tool] },
          tool_call_count: tools_used.length,
          agent_reasoning_steps: tools_used.length + 1, # tool calls + final response
          tokens_used: tokens_used,
          model: ClaudeService::MODEL,
          outcome: 'advisor_response_delivered',
          costData: cost_data('anthropic', cost_usd)
        }
      )
    end

    # Record an AI recommendation
    def track_recommendation(customer_id:, requirements:, locations_recommended: 0, tokens_used: 0, cost_usd: 0)
      record_signal(
        event_name: 'recommendation_generated',
        customer_id: customer_id,
        data: {
          product: PRODUCTS[:recommend],
          requirements_preview: requirements.to_s[0..100],
          locations_recommended: locations_recommended,
          tokens_used: tokens_used,
          model: ClaudeService::MODEL,
          outcome: 'location_recommendations_delivered',
          costData: cost_data('anthropic', cost_usd)
        }
      )
    end

    # Record a Solana on-chain mint event
    def track_mint(customer_id:, location_id:, tx_hash:, inventory_name:)
      record_signal(
        event_name: 'solana_mint',
        customer_id: customer_id,
        data: {
          product: PRODUCTS[:mint],
          location_id: location_id,
          inventory_name: inventory_name,
          tx_hash: tx_hash,
          chain: 'solana-devnet',
          outcome: 'on_chain_record_minted'
        }
      )
    end

    # Ensure or create a customer in Paid
    def ensure_customer(customer_id:, name: nil, email: nil)
      return unless enabled?

      client.customers.create(
        name: name || "Customer #{customer_id}",
        email: email,
        external_id: customer_id.to_s
      )
    rescue Paid::Error => e
      # Customer may already exist — that's fine
      Rails.logger.debug("Paid customer create: #{e.message}")
    rescue StandardError => e
      Rails.logger.warn("Paid customer error: #{e.message}")
    end

    def enabled?
      ENV['PAID_API_KEY'].present?
    end

    private

    def client
      @client ||= Paid::Client.new(token: ENV.fetch('PAID_API_KEY', ''))
    end

    def record_signal(event_name:, customer_id:, data: {})
      return unless enabled?

      client.usage.record_usage(
        signal: {
          event_name: event_name,
          agent_id: AGENT_ID,
          customer_id: customer_id.to_s,
          data: data
        }
      )
      client.usage.flush

      Rails.logger.info("Paid signal: #{event_name} for customer=#{customer_id}")
    rescue Paid::Error => e
      Rails.logger.warn("Paid signal error: #{e.status_code} #{e.message}")
    rescue StandardError => e
      Rails.logger.warn("Paid signal error: #{e.message}")
    end

    def cost_data(vendor, amount_usd)
      {
        vendor: vendor,
        cost: { amount: amount_usd.to_f.round(6), currency: 'USD' }
      }
    end
  end
end
