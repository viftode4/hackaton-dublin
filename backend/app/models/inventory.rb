# frozen_string_literal: true

class Inventory < ApplicationRecord
  # Validations
  validates :location_id, :name, :capacity_mw, presence: true
  validates :capacity_mw, :utilization_pct, :monthly_cost, 
            numericality: { greater_than: 0 }, allow_nil: true
  validates :workload_types, presence: true, if: :workload_types_required?

  # Store workload_types as array in text column
  before_save :serialize_workload_types
  after_initialize :deserialize_workload_types

  # Scopes for filtering
  scope :low_carbon, -> { where('carbon_footprint_tons < 10000') }

  private

  def serialize_workload_types
    self.workload_types = Array(workload_types).to_json if workload_types.is_a?(Array)
  end

  def deserialize_workload_types
    if workload_types.is_a?(String) && workload_types.start_with?('[')
      self.workload_types = JSON.parse(workload_types)
    end
  end

  def workload_types_required?
    true
  end
end
