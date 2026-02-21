# frozen_string_literal: true

# Configure Anthropic SDK for Claude API
if ENV['CLAUDE_API_KEY'].present?
  Anthropic.configure do |config|
    config.access_token = ENV['CLAUDE_API_KEY']
  end
end
