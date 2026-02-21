# frozen_string_literal: true

# Seed script for Orbital Atlas API
# Loads location data and demo inventory

# Load demo inventory from JSON file
demo_file = Rails.root.join('data', 'demo-inventory.json')

if File.exist?(demo_file)
  demo_data = JSON.parse(File.read(demo_file), symbolize_names: true)

  # Skip seeding if data already exists
  if Inventory.any?
    puts "⚠ Inventory already seeded (#{Inventory.count} items), skipping"
  else
    demo_data.each do |item|
      Inventory.create!(item)
      puts "✓ Created: #{item[:name]}"
    end
  end

  puts "\n✓ Seeded #{Inventory.count} inventory items"
else
  puts "⚠ Demo inventory file not found at #{demo_file}"
  puts "  Create data/demo-inventory.json with sample data to seed"
end
