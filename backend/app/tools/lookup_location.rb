# frozen_string_literal: true

class LookupLocationInput < Anthropic::BaseModel
  required :location_id, String
end

class LookupLocation < Anthropic::BaseTool
  description "Look up detailed information about a specific data center location by its ID. Returns energy costs, carbon intensity, cooling, latency, disaster risk, and more."

  input_schema LookupLocationInput

  def call(input)
    location = LocationService.find(input.location_id)
    return "Location '#{input.location_id}' not found. Use search_locations to find available locations." unless location

    location.to_json
  end
end
