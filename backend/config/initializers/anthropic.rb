# frozen_string_literal: true

# The Anthropic SDK is used via ClaudeService which creates its own client.
# No global configuration needed — API key is read from ENV['CLAUDE_API_KEY'].
#
# Usage:
#   ClaudeService.chat("message")          → Agentic chat with tool_runner
#   ClaudeService.generate_scorecard(loc)  → Direct generation
#   ClaudeService.recommend(requirements)  → Agentic recommendation
