class AddBlueprintContentToBlueprintPayments < ActiveRecord::Migration[7.1]
  def change
    add_column :blueprint_payments, :location_name, :string
    add_column :blueprint_payments, :blueprint_content, :text
    add_column :blueprint_payments, :solana_tx_hash, :string
  end
end
