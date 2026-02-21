# frozen_string_literal: true

require 'anthropic'

class ClaudeService
  MODEL = ENV.fetch('CLAUDE_MODEL', 'claude-sonnet-4-20250514')
  MAX_TOKENS = 4096

  class << self
    def advisor_tools
      @advisor_tools ||= [
        LookupLocation.new,
        SearchLocations.new,
        CompareLocations.new,
        CalculateCosts.new,
        GetPortfolio.new,
        RecommendLocations.new,
        CreatePaymentLink.new,
        CheckPaymentStatus.new
      ]
    end
    # Agentic chat — Claude can call tools in a loop to answer questions
    def chat(message, inventory = [], history = [])
      return { error: 'CLAUDE_API_KEY not configured' } if api_key.blank?

      system_prompt = load_prompt('advisor')

      messages = history.map { |h| { role: h['role'].to_sym, content: h['content'] } }
      messages << { role: :user, content: message }

      # Use the tool_runner for automatic agentic looping
      runner = client.beta.messages.tool_runner(
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system_prompt,
        messages: messages,
        tools: advisor_tools
      )

      # Collect the final text response and tool usage trace
      final_text = ""
      tools_used = []

      runner.each_message do |msg|
        msg.content.each do |block|
          if block.respond_to?(:text) && block.type.to_s == 'text'
            final_text += block.text
          elsif block.respond_to?(:name) && block.type.to_s == 'tool_use'
            tools_used << { tool: block.name, input: block.input }
          end
        end
      end

      {
        response: final_text,
        tools_used: tools_used,
        agent: true
      }
    rescue Anthropic::Errors::APIError => e
      Rails.logger.error("Anthropic API error: #{e.message}")
      { error: "AI service error: #{e.message}" }
    rescue StandardError => e
      Rails.logger.error("Claude service error: #{e.message}")
      { error: "AI service error: #{e.message}" }
    end

    # Direct generation (no tools needed) — scorecard
    def generate_scorecard(location, inventory = [])
      return { error: 'CLAUDE_API_KEY not configured' } if api_key.blank?

      system_prompt = load_prompt('scorecard')
      user_message = <<~MSG
        Generate a feasibility scorecard for this location:

        ## Location Data
        #{JSON.pretty_generate(location)}

        ## User's Current Portfolio (#{inventory.length} sites)
        #{JSON.pretty_generate(inventory)}

        Respond with ONLY valid JSON matching the scorecard format.
      MSG

      response = create_message(system_prompt, user_message)
      parse_json_response(response)
    end

    # Direct generation (no tools needed) — blueprint
    def generate_blueprint(location, scorecard = {}, inventory = [])
      return { error: 'CLAUDE_API_KEY not configured' } if api_key.blank?

      system_prompt = load_prompt('blueprint')
      user_message = <<~MSG
        Generate a detailed blueprint for building a data center at:

        ## Location Data
        #{JSON.pretty_generate(location)}

        ## Scorecard
        #{JSON.pretty_generate(scorecard)}

        ## User's Current Portfolio
        #{JSON.pretty_generate(inventory)}

        Respond with ONLY valid JSON matching the blueprint format.
      MSG

      response = create_message(system_prompt, user_message)
      parse_json_response(response)
    end

    # Agentic recommendation — uses tools to find the best locations
    def recommend(requirements, inventory = [])
      return { error: 'CLAUDE_API_KEY not configured' } if api_key.blank?

      system_prompt = load_prompt('recommend')

      messages = [{
        role: :user,
        content: <<~MSG
          Requirements: #{requirements}

          Use the available tools to search locations, compare them, calculate costs,
          and check the user's current portfolio before making recommendations.

          Respond with ONLY valid JSON matching the recommendation format.
        MSG
      }]

      runner = client.beta.messages.tool_runner(
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system_prompt,
        messages: messages,
        tools: advisor_tools
      )

      final_text = ""
      runner.each_message do |msg|
        msg.content.each do |block|
          final_text += block.text if block.respond_to?(:text) && block.type.to_s == 'text'
        end
      end

      parse_json_response(final_text)
    rescue Anthropic::Errors::APIError => e
      Rails.logger.error("Anthropic API error: #{e.message}")
      { error: "AI service error: #{e.message}" }
    rescue StandardError => e
      Rails.logger.error("Claude service error: #{e.message}")
      { error: "AI service error: #{e.message}" }
    end

    private

    def client
      @client ||= Anthropic::Client.new(
        api_key: api_key,
        base_url: ENV.fetch('CRUSOE_INFERENCE_URL', nil)
      )
    end

    def api_key
      ENV.fetch('CLAUDE_API_KEY', nil)
    end

    def create_message(system, user_message)
      response = client.messages.create(
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system,
        messages: [{ role: :user, content: user_message }]
      )

      text_block = response.content.find { |b| b.is_a?(Anthropic::Models::TextBlock) }
      return { error: 'Empty response from Claude' } unless text_block

      text_block.text
    rescue Anthropic::Errors::APIError => e
      Rails.logger.error("Anthropic API error: #{e.message}")
      { error: "AI service error: #{e.message}" }
    end

    def parse_json_response(response)
      return response if response.is_a?(Hash) && response[:error]

      json_str = response.to_s
      json_str = json_str[/```json\s*\n?(.*?)\n?```/m, 1] || json_str
      json_str = json_str.strip

      JSON.parse(json_str)
    rescue JSON::ParserError => e
      Rails.logger.warn("Failed to parse Claude JSON response: #{e.message}")
      { summary: response.to_s, parse_error: true }
    end

    def load_prompt(name)
      path = Rails.root.join('prompts', "#{name}.md")
      if File.exist?(path)
        File.read(path)
      else
        Rails.logger.warn("Prompt file not found: #{path}, using default")
        default_prompt(name)
      end
    end

    def default_prompt(name)
      case name
      when 'scorecard'
        "You are a data center infrastructure expert. Generate a JSON scorecard."
      when 'blueprint'
        "You are a data center infrastructure expert. Generate a JSON blueprint."
      when 'advisor'
        advisor_system_prompt
      when 'recommend'
        "You are a data center planning expert. Use the available tools to research locations, calculate costs, and check the user's portfolio before recommending the best locations. Respond with valid JSON."
      else
        "You are a helpful assistant."
      end
    end

    def advisor_system_prompt
      <<~PROMPT
        You are an expert data center infrastructure consultant for Orbital Atlas, a platform that helps companies plan data center deployments across Earth, Moon, Mars, and orbital stations.

        You have access to tools that let you:
        - Search and look up location data (energy costs, carbon intensity, latency, risks)
        - Compare multiple locations side-by-side
        - Calculate construction and operating costs for any capacity
        - View the user's current portfolio of data centers
        - Get filtered recommendations based on specific criteria

        ALWAYS use your tools to look up real data before answering. Don't guess or make up numbers.
        When comparing options, use the compare_locations tool.
        When discussing costs, use the calculate_costs tool with specific numbers.
        When the user asks about their portfolio, use get_portfolio first.

        Be concise but thorough. Use data from the tools to back up your recommendations.
        You can discuss locations on Earth, the Moon, Mars, and in orbit — this is a futuristic planning platform.
      PROMPT
    end
  end
end
