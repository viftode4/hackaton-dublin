# frozen_string_literal: true

class CreateBlueprintPayments < ActiveRecord::Migration[7.1]
  def change
    create_table :blueprint_payments do |t|
      t.string :location_id, null: false
      t.string :customer_id, null: false
      t.string :stripe_session_id, null: false
      t.string :stripe_payment_intent_id
      t.string :customer_email
      t.integer :amount_cents, null: false, default: 29900
      t.string :currency, null: false, default: 'usd'
      t.string :status, null: false, default: 'pending' # pending, paid, failed
      t.datetime :paid_at

      t.timestamps
    end

    add_index :blueprint_payments, :stripe_session_id, unique: true
    add_index :blueprint_payments, :location_id
    add_index :blueprint_payments, :customer_id
    add_index :blueprint_payments, [:customer_id, :location_id]
  end
end
