# frozen_string_literal: true

class SearchLocationsInput < Anthropic::BaseModel
  optional :body, String
  optional :query, String
end

class SearchLocations < Anthropic::BaseTool
  description "Search for data center locations. Filter by celestial body (earth, moon, mars, orbit) or search by name/region. Returns a list of matching locations with key metrics."

  input_schema SearchLocationsInput

  def call(input)
    locations = if input.respond_to?(:body) && input.body.present?
                  LocationService.by_body(input.body)
                elsif input.respond_to?(:query) && input.query.present?
                  LocationService.search(input.query)
                else
                  LocationService.all
                end

    locations.map do |loc|
      {
        id: loc[:id],
        name: loc[:name],
        body: loc[:body],
        energy_cost_kwh: loc[:energy_cost_kwh],
        carbon_intensity_gco2: loc[:carbon_intensity_gco2],
        construction_cost_mw: loc[:construction_cost_mw],
        disaster_risk: loc[:disaster_risk],
        political_stability: loc[:political_stability]
      }
    end.to_json
  end
end
