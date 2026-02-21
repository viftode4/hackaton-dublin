# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[7.1].define(version: 2026_02_22_000001) do
  create_table "blueprint_payments", force: :cascade do |t|
    t.string "location_id", null: false
    t.string "customer_id", null: false
    t.string "stripe_session_id", null: false
    t.string "stripe_payment_intent_id"
    t.string "customer_email"
    t.integer "amount_cents", default: 29900, null: false
    t.string "currency", default: "usd", null: false
    t.string "status", default: "pending", null: false
    t.datetime "paid_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["customer_id", "location_id"], name: "index_blueprint_payments_on_customer_id_and_location_id"
    t.index ["customer_id"], name: "index_blueprint_payments_on_customer_id"
    t.index ["location_id"], name: "index_blueprint_payments_on_location_id"
    t.index ["stripe_session_id"], name: "index_blueprint_payments_on_stripe_session_id", unique: true
  end

  create_table "inventories", force: :cascade do |t|
    t.string "location_id", null: false
    t.string "name", null: false
    t.float "capacity_mw", null: false
    t.text "workload_types", default: "[]"
    t.float "utilization_pct", default: 0.0
    t.float "carbon_footprint_tons", default: 0.0
    t.string "power_source"
    t.string "solana_tx_hash"
    t.float "monthly_cost", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["location_id"], name: "index_inventories_on_location_id"
    t.index ["solana_tx_hash"], name: "index_inventories_on_solana_tx_hash", unique: true
  end

end
