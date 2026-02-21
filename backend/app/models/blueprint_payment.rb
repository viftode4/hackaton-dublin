# frozen_string_literal: true

class BlueprintPayment < ApplicationRecord
  validates :location_id, :customer_id, :stripe_session_id, presence: true
  validates :stripe_session_id, uniqueness: true

  scope :paid, -> { where(status: 'paid') }
  scope :for_customer, ->(cid) { where(customer_id: cid) }
  scope :for_location, ->(lid) { where(location_id: lid) }

  def paid?
    status == 'paid'
  end

  # Check if a customer has paid for a specific location's blueprint
  def self.paid_for?(customer_id:, location_id:)
    paid.for_customer(customer_id).for_location(location_id).exists?
  end
end
