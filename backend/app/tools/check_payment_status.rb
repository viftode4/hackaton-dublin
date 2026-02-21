# frozen_string_literal: true

class CheckPaymentStatusInput < Anthropic::BaseModel
  optional :location_id, String
  optional :customer_id, String
  optional :session_id, String
end

class CheckPaymentStatus < Anthropic::BaseTool
  description "Check if a user has paid for a blueprint for a specific location. Can look up by location_id + customer_id, or by a specific Stripe session_id. Use this before generating a full blueprint to verify payment, or when a user asks about their payment status."

  input_schema CheckPaymentStatusInput

  def call(input)
    # Look up by session ID if provided
    if input.respond_to?(:session_id) && input.session_id.present?
      return check_by_session(input.session_id)
    end

    # Look up by customer + location
    customer_id = input.respond_to?(:customer_id) && input.customer_id.present? ? input.customer_id : nil
    location_id = input.respond_to?(:location_id) && input.location_id.present? ? input.location_id : nil

    if customer_id.blank? && location_id.blank?
      return { error: 'Provide at least one of: session_id, location_id, or customer_id' }.to_json
    end

    payments = BlueprintPayment.all
    payments = payments.for_customer(customer_id) if customer_id.present?
    payments = payments.for_location(location_id) if location_id.present?

    paid_payments = payments.paid
    all_payments = payments.order(created_at: :desc).limit(5)

    {
      has_paid: paid_payments.exists?,
      paid_count: paid_payments.count,
      recent_payments: all_payments.map do |p|
        {
          location_id: p.location_id,
          status: p.status,
          amount: "$#{(p.amount_cents / 100.0).round(2)}",
          paid_at: p.paid_at&.iso8601,
          session_id: p.stripe_session_id
        }
      end,
      message: paid_payments.exists? ? "Payment confirmed — blueprint access is unlocked." : "No completed payment found. The user needs to purchase a blueprint first."
    }.to_json
  end

  private

  def check_by_session(session_id)
    payment = BlueprintPayment.find_by(stripe_session_id: session_id)

    if payment
      {
        has_paid: payment.paid?,
        status: payment.status,
        location_id: payment.location_id,
        amount: "$#{(payment.amount_cents / 100.0).round(2)}",
        paid_at: payment.paid_at&.iso8601,
        message: payment.paid? ? "Payment confirmed." : "Payment is #{payment.status}."
      }.to_json
    else
      # Check Stripe directly
      return { error: 'Stripe not configured' }.to_json unless ENV['STRIPE_SECRET_KEY'].present?

      session = Stripe::Checkout::Session.retrieve(session_id)
      {
        has_paid: session.payment_status == 'paid',
        status: session.payment_status,
        location_id: session.metadata&.dig('location_id'),
        amount_total: session.amount_total,
        message: session.payment_status == 'paid' ? "Payment confirmed via Stripe." : "Payment status: #{session.payment_status}"
      }.to_json
    end
  rescue Stripe::StripeError => e
    { error: "Could not check payment: #{e.message}" }.to_json
  end
end
