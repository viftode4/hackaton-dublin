# frozen_string_literal: true

class CreateInventories < ActiveRecord::Migration[7.1]
  def change
    create_table :inventories do |t|
      t.string :location_id, null: false
      t.string :name, null: false
      t.float :capacity_mw, null: false
      t.text :workload_types, default: '[]'
      t.float :utilization_pct, default: 0
      t.float :carbon_footprint_tons, default: 0
      t.string :power_source
      t.string :solana_tx_hash
      t.float :monthly_cost, null: false

      t.timestamps
    end

    add_index :inventories, :location_id
    add_index :inventories, :solana_tx_hash, unique: true
  end
end
