# frozen_string_literal: true

class CreatePaymentLinkInput < Anthropic::BaseModel
  required :location_id, String
  required :location_name, String
end

class CreatePaymentLink < Anthropic::BaseTool
  description "Create a Stripe payment link for purchasing a detailed data center blueprint. Use this when a user wants to buy a full feasibility blueprint for a specific location. Returns a payment URL the user can click to complete the purchase ($299). Do NOT ask the user for their email — just create the link directly."

  input_schema CreatePaymentLinkInput

  BLUEPRINT_PRICE_CENTS = 29900

  def call(input)
    unless ENV['STRIPE_SECRET_KEY'].present?
      return { error: 'Stripe not configured', message: 'Payment processing is not available in this environment.' }.to_json
    end

    location = LocationService.find(input.location_id)
    return { error: "Location '#{input.location_id}' not found." }.to_json unless location

    session = Stripe::Checkout::Session.create(
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: "Data Center Feasibility Blueprint",
              description: "Comprehensive blueprint for #{input.location_name} — includes site analysis, cost projections, risk assessment, and implementation timeline.",
              metadata: { location_id: input.location_id }
            },
            unit_amount: BLUEPRINT_PRICE_CENTS
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      metadata: {
        location_id: input.location_id,
        location_name: input.location_name,
        customer_id: 'anonymous'
      },
      success_url: ENV['STRIPE_SUCCESS_URL'] || 'https://orbital-atlas.app/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: ENV['STRIPE_CANCEL_URL'] || 'https://orbital-atlas.app/cancel'
    )

    # Also record pending payment in DB
    BlueprintPayment.create!(
      location_id: input.location_id,
      customer_id: 'anonymous',
      stripe_session_id: session.id,
      location_name: input.location_name,
      amount_cents: BLUEPRINT_PRICE_CENTS,
      currency: 'usd',
      status: 'pending'
    )

    {
      payment_url: session.url,
      session_id: session.id,
      location_id: input.location_id,
      location_name: input.location_name,
      amount: "$#{(BLUEPRINT_PRICE_CENTS / 100.0).round(2)}",
      message: "Payment link created! Click the link to complete your blueprint purchase."
    }.to_json
  rescue Stripe::StripeError => e
    { error: "Stripe error: #{e.message}" }.to_json
  end
end
