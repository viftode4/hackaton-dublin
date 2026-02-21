# frozen_string_literal: true

class LocationService
  LOCATIONS_DIR = Rails.root.join('data', 'locations')

  class << self
    # Load all locations from JSON files
    def all
      @all ||= Dir.glob(LOCATIONS_DIR.join('*.json'))
                    .sort
                    .flat_map { |file| load_locations_from_file(file) }
    end

    # Find a single location by ID
    def find(id)
      all.find { |loc| loc[:id].to_s == id.to_s }
    end

    # Filter locations by celestial body
    def by_body(body)
      all.select { |loc| loc[:body].to_s.downcase == body.to_s.downcase }
    end

    # Get locations by workload type
    def by_workload(workload_type)
      all.select do |loc|
        loc.dig(:special_factors, []).any? do |factor|
          factor.downcase.include?(workload_type.downcase)
        end
      end
    end

    # Search locations by name, id, or regulatory
    def search(query)
      q = query.downcase
      all.select do |loc|
        loc[:name].downcase.include?(q) ||
          loc[:id].downcase.include?(q) ||
          loc[:regulatory]&.downcase&.include?(q)
      end
    end

    private

    def load_locations_from_file(file)
      content = File.read(file)
      data = JSON.parse(content, symbolize_names: true)
      Array(data)  # Ensure it's an array
    rescue JSON::ParserError => e
      Rails.logger.error("Error parsing #{file}: #{e.message}")
      []
    end
  end
end
